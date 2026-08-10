import { Driver } from 'homey';

class MarshallHestonDriver extends Driver {
  async onInit() {
    this.log('MarshallHestonDriver has been initialized');
  }

  async onPairListDevices() {
    const discoveryResults = this.getDiscoveryStrategy().getDiscoveryResults();

    return Object.values(discoveryResults)
      .filter((result: any) => {
        const description = JSON.stringify(result).toLowerCase();
        return description.includes('heston') || description.includes('marshall');
      })
      .map((result: any) => ({
        name: result.name || result.txt?.fn || 'Marshall Heston',
        data: {
          id: result.id || result.txt?.id || result.address,
        },
        settings: {
          address: result.address,
        },
        store: {
          address: result.address,
        },
      }));
  }
}

module.exports = MarshallHestonDriver;
