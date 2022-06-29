const { ethers, deployments, run } = require('hardhat');
const { toBytes32, hexETHString } = require('../test-utils').strings;

class Main {
  #targetCurrency = hexETHString;

  #aliceSigner;
  #bobSigner;
  #carolSigner;

  #collateralAggregator;
  #collateralVault;

  async run() {
    await this._init();
    await this._test();
  }

  async _init() {
    const blockNumber = await ethers.provider.getBlockNumber();
    const network = await ethers.provider.getNetwork();

    console.log('Block number is', blockNumber);
    console.log('Chain id is', network.chainId);

    [this.#aliceSigner, this.#bobSigner, this.#carolSigner] =
      await ethers.getSigners();

    console.table(
      {
        alice: this.#aliceSigner,
        bob: this.#bobSigner,
        carol: this.#carolSigner,
      },
      ['address'],
    );

    // Get contracts
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    const getProxy = async (key, contract) =>
      proxyController
        .getAddress(toBytes32(key))
        .then((address) => ethers.getContractAt(contract || key, address));

    this.#collateralAggregator = await getProxy(
      'CollateralAggregator',
      'CollateralAggregatorV2',
    );
    this.#collateralVault = await getProxy('CollateralVault');

    console.table(
      {
        collateralAggregator: this.#collateralAggregator,
        collateralVault: this.#collateralVault,
      },
      ['address'],
    );
  }

  async _test() {
    // Deposit ETH
    const depositAmount = ethers.BigNumber.from(
      '90000000000000000000',
    ).toString();

    await this.#collateralAggregator
      .connect(this.#bobSigner)
      ['register()']()
      .then((tx) => tx.wait());
    await this.#collateralVault
      .connect(this.#bobSigner)
      ['deposit(bytes32,uint256)'](this.#targetCurrency, depositAmount, {
        value: depositAmount,
      })
      .then((tx) => tx.wait());

    // TODO: Add more tests
  }
}

new Main()
  .run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
