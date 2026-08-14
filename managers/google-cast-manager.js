const { Client } = require('castv2-client');

class GoogleCastManager {
  constructor(address) {
    this.address = address;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected && this.client) return;

    await new Promise((resolve, reject) => {
      const client = new Client();
      let settled = false;

      const fail = (error) => {
        this.connected = false;
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      client.once('error', fail);
      client.connect(this.address, () => {
        settled = true;
        this.client = client;
        this.connected = true;
        client.on('error', () => {
          this.connected = false;
        });
        resolve();
      });
    });
  }

  async getStatus() {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.client.getStatus((error, status) => error ? reject(error) : resolve(status));
    });
  }

  async setVolume(level) {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.client.setVolume({ level }, (error, volume) => error ? reject(error) : resolve(volume));
    });
  }

  async setMuted(muted) {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.client.setVolume({ muted }, (error, volume) => error ? reject(error) : resolve(volume));
    });
  }

  disconnect() {
    if (this.client) this.client.close();
    this.client = null;
    this.connected = false;
  }
}

module.exports = GoogleCastManager;
