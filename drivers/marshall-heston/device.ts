import { Device } from 'homey';

const GoogleCastManager = require('../../managers/google-cast-manager.js');
const HestonAPIManager = require('../../managers/heston-api-manager.js');

class MarshallHestonDevice extends Device {
  static readonly HESTON_CAPABILITIES = [
    'volume_set',
    'volume_mute',
    'speaker_track',
    'speaker_artist',
    'speaker_album',
    'heston_pause',
    'heston_preset',
    'heston_bass',
    'heston_treble',
    'heston_source',
    'heston_sound_mode',
  ];

  castManager: any;
  hestonAPIManager: any;
  statusTimeout: NodeJS.Timeout | undefined;
  deleted: boolean = false;

  async onInit() {
    for (const capability of ['speaker_playing', 'speaker_prev', 'speaker_next']) {
      if (this.hasCapability(capability)) {
        await this.removeCapability(capability);
      }
    }

    for (const capability of MarshallHestonDevice.HESTON_CAPABILITIES) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability);
      }
    }

    const address = this.getStoreValue('address') || this.getSetting('address');
    this.castManager = new GoogleCastManager(address);
    this.hestonAPIManager = new HestonAPIManager(address);

    this.registerCapabilityListener('volume_set', async (value) => {
      await this.castManager.setVolume(value);
    });
    this.registerCapabilityListener('volume_mute', async (value) => {
      await this.castManager.setMuted(value);
    });
    this.registerCapabilityListener('heston_pause', async () => {
      await this.hestonAPIManager.pause();
    });
    this.registerCapabilityListener('heston_preset', async (value) => {
      await this.hestonAPIManager.playPreset(Number.parseInt(value, 10));
    });
    this.registerCapabilityListener('heston_bass', async (value) => {
      await this.hestonAPIManager.setTone('bass', value);
    });
    this.registerCapabilityListener('heston_treble', async (value) => {
      await this.hestonAPIManager.setTone('treble', value);
    });
    this.registerCapabilityListener('heston_source', async (value) => {
      await this.hestonAPIManager.setSource(value);
    });
    this.registerCapabilityListener('heston_sound_mode', async (value) => {
      await this.hestonAPIManager.setSoundMode(value);
    });

    await this.refreshStatus();
    this.log('MarshallHestonDevice has been initialized');
  }

  async onAdded() {
    const address = this.getStoreValue('address');
    if (address) await this.setSettings({ address });
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: { [key: string]: any }, changedKeys: string[] }) {
    if (!changedKeys.includes('address')) return;

    this.castManager.disconnect();
    await this.setStoreValue('address', newSettings.address);
    this.castManager = new GoogleCastManager(newSettings.address);
    this.hestonAPIManager = new HestonAPIManager(newSettings.address);
    await this.refreshStatus();
  }

  async onDeleted() {
    this.deleted = true;
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.castManager.disconnect();
  }

  async refreshStatus() {
    if (this.deleted) return;

    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    try {
      const [status, hestonState] = await Promise.all([
        this.castManager.getStatus(),
        this.hestonAPIManager.getState(),
      ]);
      const volume = status && status.volume;
      if (volume && typeof volume.level === 'number') {
        await this.setCapabilityValue('volume_set', volume.level);
      }
      if (volume && typeof volume.muted === 'boolean') {
        await this.setCapabilityValue('volume_mute', volume.muted);
      }
      if (hestonState.source) {
        await this.setCapabilityValue('heston_source', hestonState.source);
      }
      if (hestonState.mode) {
        await this.setCapabilityValue('heston_sound_mode', hestonState.mode);
      }
      if (typeof hestonState.bass === 'number') {
        await this.setCapabilityValue('heston_bass', hestonState.bass);
      }
      if (typeof hestonState.treble === 'number') {
        await this.setCapabilityValue('heston_treble', hestonState.treble);
      }
      await this.setCapabilityValue('speaker_track', hestonState.title);
      await this.setCapabilityValue('speaker_artist', hestonState.artist);
      await this.setCapabilityValue('speaker_album', hestonState.album);
      await this.setAvailable();
    } catch (error) {
      this.castManager.disconnect();
      await this.setUnavailable('Unable to connect to the Heston soundbar').catch(this.error);
      this.error('Could not update Heston status', error);
    } finally {
      if (!this.deleted) {
        this.statusTimeout = setTimeout(() => this.refreshStatus(), 10 * 1000);
      }
    }
  }
}

module.exports = MarshallHestonDevice;
