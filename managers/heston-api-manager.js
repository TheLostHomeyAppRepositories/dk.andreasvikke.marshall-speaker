const fetch = require('node-fetch');
const https = require('https');

const EQ_PATHS = {
  movie: 'settings:/zappa/audio/eqMovie',
  music: 'settings:/zappa/audio/eqMusic',
  night: 'settings:/zappa/audio/eqNight',
  voice: 'settings:/zappa/audio/eqVoice',
};

class HestonAPIManager {
  constructor(address, timeout = 5000) {
    this.baseUrl = `https://${address}:4430`;
    this.timeout = timeout;
    this.agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: false,
    });
    this.toneQueue = Promise.resolve();
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      timeout: this.timeout,
      agent: this.agent,
      ...options,
    });
    const text = await response.text();
    let body = null;

    if (text) {
      try {
        body = JSON.parse(text);
      } catch (error) {
        body = text;
      }
    }
    if (!response.ok) {
      const message = body?.error?.message || response.statusText;
      throw new Error(`Heston API: ${message}`);
    }
    return body;
  }

  async getData(path, role = 'value') {
    const query = new URLSearchParams({ path, roles: role });
    const requestPath = `/api/getData?${query.toString()}`;

    try {
      const values = await this.request(requestPath);
      return Array.isArray(values) ? values[0] : values;
    } catch (error) {
      const values = await this.request(requestPath);
      return Array.isArray(values) ? values[0] : values;
    }
  }

  async setData(path, role, value) {
    return this.request('/api/setData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, role, value }),
    });
  }

  async getSource() {
    const value = await this.getData('settings:/zappa/physicalSource');
    return value?.zappaPhysicalSource;
  }

  async setSource(source) {
    return this.setData('settings:/zappa/physicalSource', 'value', {
      type: 'zappaPhysicalSource',
      zappaPhysicalSource: source,
    });
  }

  async getSoundMode() {
    const value = await this.getData('zappa:soundMode');
    return value?.zappaSoundMode;
  }

  async setSoundMode(mode) {
    return this.setData('zappa:soundMode/request', 'activate', {
      type: 'zappaSoundMode',
      zappaSoundMode: mode,
    });
  }

  async getEqualizer(mode) {
    const path = EQ_PATHS[mode];
    if (!path) throw new Error(`Unsupported Heston sound mode: ${mode}`);

    const value = await this.getData(path);
    return value?.zappaEqualizerValue;
  }

  async setEqualizer(mode, equalizer) {
    const path = EQ_PATHS[mode];
    if (!path) throw new Error(`Unsupported Heston sound mode: ${mode}`);

    const write = () => this.setData(path, 'value', {
      type: 'zappaEqualizerValue',
      zappaEqualizerValue: equalizer,
    });

    try {
      return await write();
    } catch (error) {
      // The soundbar can close the connection after applying an EQ update.
      // Check its state before retrying so the write is not duplicated blindly.
      const current = await this.getEqualizer(mode).catch(() => null);
      const applied = current && Object.keys(equalizer)
        .every((key) => current[key] === equalizer[key]);
      if (applied) return current;
      return write();
    }
  }

  toDeviceEqualizerValue(value) {
    return value < 0 ? value * 2 : value;
  }

  toCapabilityEqualizerValue(value) {
    return value < 0 ? value / 2 : value;
  }

  async setTone(band, value) {
    const update = async () => {
      const mode = await this.getSoundMode();
      const current = await this.getEqualizer(mode);
      const equalizer = {};
      for (let index = 1; index <= 5; index += 1) {
        const key = `value${index}`;
        equalizer[key] = Number.isFinite(current?.[key]) ? current[key] : 0;
      }
      const key = band === 'bass' ? 'value1' : 'value5';
      equalizer[key] = this.toDeviceEqualizerValue(value);
      await this.setEqualizer(mode, equalizer);
    };

    const result = this.toneQueue.then(update, update);
    this.toneQueue = result.catch(() => undefined);
    return result;
  }

  async getState() {
    const [source, mode] = await Promise.all([
      this.getSource(),
      this.getSoundMode(),
    ]);
    const equalizer = await this.getEqualizer(mode);

    return {
      source,
      mode,
      bass: this.toCapabilityEqualizerValue(equalizer.value1 ?? 0),
      treble: this.toCapabilityEqualizerValue(equalizer.value5 ?? 0),
    };
  }

  async playPreset(presetIndex) {
    return this.setData(`zappa:presets/play?id=${presetIndex}`, 'activate', {});
  }
}

module.exports = HestonAPIManager;
