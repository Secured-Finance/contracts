import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

const AddressResolver = artifacts.require('AddressResolver');
const CurrencyController = artifacts.require('CurrencyController');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const ProxyController = artifacts.require('ProxyController');

const { deployContract, deployMockContract } = waffle;

describe('CurrencyController', () => {
  let currencyControllerProxy: Contract;
  let mockPriceFeed: MockContract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let testIdx = 0;

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    // Set up for the mocks
    mockPriceFeed = await deployMockContract(owner, MockV3Aggregator.abi);

    // Deploy
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const currencyController = await deployContract(owner, CurrencyController, [
      18,
    ]);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);

    const currencyControllerAddress = await proxyController
      .setCurrencyControllerImpl(currencyController.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyUpdated').args
            .proxyAddress,
      );

    currencyControllerProxy = await ethers.getContractAt(
      'CurrencyController',
      currencyControllerAddress,
    );
  });

  describe('Initialization', async () => {
    it('Add a currency except for ETH as a supported currency', async () => {
      const currency = ethers.utils.formatBytes32String('WFIL');
      const { timestamp: now } = await ethers.provider.getBlock('latest');

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, now, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      const tx = await currencyControllerProxy.addCurrency(
        currency,
        18,
        9000,
        [mockPriceFeed.address],
        [86400],
      );
      await expect(tx).to.emit(currencyControllerProxy, 'CurrencyAdded');
      await expect(tx).to.emit(currencyControllerProxy, 'PriceFeedUpdated');

      await currencyControllerProxy.currencyExists(currency).then((exists) => {
        expect(exists).to.true;
      });

      await currencyControllerProxy.getCurrencies().then((currencies) => {
        expect(currencies.length).to.equal(1);
        expect(currencies[0]).to.equal(currency);
      });

      await currencyControllerProxy
        .currencyExists(ethers.utils.formatBytes32String('TEST'))
        .then((exists) => expect(exists).to.equal(false));

      await currencyControllerProxy
        .getDecimals(currency)
        .then((decimals) => expect(decimals).to.equal(18));

      await currencyControllerProxy
        .getHaircut(currency)
        .then((haircut) => expect(haircut).to.equal(9000));

      await currencyControllerProxy
        .getPriceFeed(currency)
        .then(({ instances, heartbeats }) => {
          expect(instances.length).to.equal(1);
          expect(instances[0]).to.equal(mockPriceFeed.address);
          expect(heartbeats.length).to.equal(1);
          expect(heartbeats[0]).to.equal(86400);
        });
    });

    it('Fail to add a currency due to the invalid price', async () => {
      const currency = ethers.utils.formatBytes32String('ETH');

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, -1, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.addCurrency(
          currency,
          18,
          8000,
          [mockPriceFeed.address],
          [86400],
        ),
      ).to.be.revertedWith('InvalidPriceFeed');
    });

    it('Fail to add a currency due to the invalid decimals', async () => {
      const currency = ethers.utils.formatBytes32String('ETH');

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(19);

      await expect(
        currencyControllerProxy.addCurrency(
          currency,
          18,
          8000,
          [mockPriceFeed.address],
          [86400],
        ),
      ).to.be.revertedWith(`InvalidDecimals("${mockPriceFeed.address}", 19)`);
    });

    it('Fail to add a currency due to the mismatch of price feeds decimals with the base currency', async () => {
      const currency = ethers.utils.formatBytes32String('ETH');

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(10);

      await expect(
        currencyControllerProxy.addCurrency(
          currency,
          18,
          8000,
          [mockPriceFeed.address],
          [86400],
        ),
      ).to.be.revertedWith(`InvalidDecimals("${mockPriceFeed.address}", 10)`);
    });

    it('Fail to add a currency due to empty price feed', async () => {
      const currency = ethers.utils.formatBytes32String('ETH');

      await expect(
        currencyControllerProxy.addCurrency(currency, 18, 9000, [], []),
      ).revertedWith('InvalidPriceFeedInputs');
    });

    it('Fail to add a currency due to input array length mismatch', async () => {
      const currency = ethers.utils.formatBytes32String('ETH');

      await expect(
        currencyControllerProxy.addCurrency(
          currency,
          18,
          9000,
          [mockPriceFeed.address],
          [],
        ),
      ).revertedWith('InvalidPriceFeedInputs');
    });

    it('Fail to add a currency due to execution by non-owner', async () => {
      const currency = ethers.utils.formatBytes32String('ETH');

      await expect(
        currencyControllerProxy
          .connect(alice)
          .addCurrency(currency, 18, 9000, [mockPriceFeed.address], [0]),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(
        currencyControllerProxy.initialize(owner.address),
      ).revertedWith('Initializable: contract is already initialized');
    });

    it('Fail to call initialization due to execution by non-proxy contract', async () => {
      const currencyController = await deployContract(
        owner,
        CurrencyController,
        [18],
      );

      await expect(currencyController.initialize(owner.address)).revertedWith(
        'Must be called from proxy contract',
      );
    });
  });

  describe('Update', async () => {
    let currency: string;

    beforeEach(async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      currency = ethers.utils.formatBytes32String(`Test${testIdx}`);
      testIdx++;

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, now, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await currencyControllerProxy.addCurrency(
        currency,
        18,
        9000,
        [mockPriceFeed.address],
        [86400],
      );
    });

    it('Update a currency support', async () => {
      await expect(currencyControllerProxy.removeCurrency(currency))
        .to.emit(currencyControllerProxy, 'CurrencyRemoved')
        .withArgs(currency);

      expect(await currencyControllerProxy.currencyExists(currency)).to.false;
    });

    it('Update a haircut', async () => {
      await expect(currencyControllerProxy.updateHaircut(currency, 10))
        .to.emit(currencyControllerProxy, 'HaircutUpdated')
        .withArgs(currency, 10);

      expect(await currencyControllerProxy.getHaircut(currency)).to.equal(10);
    });

    it('Update a price feed', async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');

      // Set up for the mocks
      const newMockPriceFeed = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed.mock.latestRoundData.returns(0, 200, 0, now, 0);
      await newMockPriceFeed.mock.getRoundData.returns(0, 300, 0, 1000, 0);
      await newMockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.updatePriceFeed(
          currency,
          18,
          [newMockPriceFeed.address],
          [86400],
        ),
      ).to.emit(currencyControllerProxy, 'PriceFeedUpdated');

      expect(
        await currencyControllerProxy.getAggregatedLastPrice(currency),
      ).to.equal(200);
      expect(await currencyControllerProxy.getLastPrice(currency)).to.equal(
        200,
      );
    });

    it('Update multiple price feeds', async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');

      // Set up for the mocks
      const newMockPriceFeed1 = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      const newMockPriceFeed2 = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed1.mock.latestRoundData.returns(
        0,
        '2000000',
        0,
        now,
        0,
      );
      await newMockPriceFeed1.mock.getRoundData.returns(0, 200, 0, 2000, 0);
      await newMockPriceFeed1.mock.decimals.returns(6);
      await newMockPriceFeed2.mock.latestRoundData.returns(
        0,
        '4000000000000000000',
        0,
        now,
        0,
      );
      await newMockPriceFeed2.mock.getRoundData.returns(0, 500, 0, 1000, 0);
      await newMockPriceFeed2.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.updatePriceFeed(
          currency,
          18,
          [newMockPriceFeed1.address, newMockPriceFeed2.address],
          [86400, 3600],
        ),
      ).to.emit(currencyControllerProxy, 'PriceFeedUpdated');

      expect(await currencyControllerProxy.getDecimals(currency)).to.equal(18);
      expect(
        await currencyControllerProxy.getAggregatedLastPrice(currency),
      ).to.equal('8000000000000000000000000');
      expect(await currencyControllerProxy.getLastPrice(currency)).to.equal(
        '8000000000000000000',
      );
    });

    it('Update multiple data using multicall', async () => {
      const currency1 = ethers.utils.formatBytes32String('CCY1');
      const currency2 = ethers.utils.formatBytes32String('CCY2');

      const inputs = [
        [currency1, 18, 9000, [mockPriceFeed.address], [86400]],
        [currency2, 18, 8000, [mockPriceFeed.address], [3600]],
      ];

      await currencyControllerProxy.multicall(
        inputs.map((input) =>
          currencyControllerProxy.interface.encodeFunctionData(
            'addCurrency',
            input,
          ),
        ),
      );

      const haircut1 = await currencyControllerProxy.getHaircut(currency1);
      const haircut2 = await currencyControllerProxy.getHaircut(currency2);

      expect(haircut1).to.equal(9000);
      expect(haircut2).to.equal(8000);
    });

    it('Fail to update the haircut due to overflow', async () => {
      await expect(
        currencyControllerProxy.updateHaircut(currency, 10001),
      ).to.be.revertedWith('InvalidHaircut');
    });

    it('Fail to update the haircut due to invalid currency', async () => {
      await expect(
        currencyControllerProxy.updateHaircut(
          ethers.utils.formatBytes32String('TEST'),
          10001,
        ),
      ).to.be.revertedWith('InvalidCurrency');
    });

    it('Fail to update the price feed due to invalid currency', async () => {
      await expect(
        currencyControllerProxy.updatePriceFeed(
          ethers.utils.formatBytes32String('TEST'),
          1,
          [],
          [],
        ),
      ).to.be.revertedWith('InvalidCurrency');
    });

    it('Fail to update the price feed due to input array length mismatch', async () => {
      await currencyControllerProxy.addCurrency(
        currency,
        18,
        9000,
        [mockPriceFeed.address],
        [0],
      );

      await expect(
        currencyControllerProxy.updatePriceFeed(
          currency,
          1,
          [mockPriceFeed.address],
          [],
        ),
      ).to.be.revertedWith('InvalidPriceFeedInputs');
    });

    it('Fail to remove the currency due to execution by non-owner', async () => {
      await expect(
        currencyControllerProxy.connect(alice).removeCurrency(currency),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to update the haircut due to execution by non-owner', async () => {
      await expect(
        currencyControllerProxy.connect(alice).updateHaircut(currency, 1),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to update the price feed due to execution by non-owner', async () => {
      await expect(
        currencyControllerProxy
          .connect(alice)
          .updatePriceFeed(currency, 1, [], []),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to update the price feed due to stale price feed with old timestamp', async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mockPriceFeed.mock.latestRoundData.returns(
        0,
        10000000000,
        0,
        now - 86400 - 60 * 5,
        0,
      );

      await expect(
        currencyControllerProxy.updatePriceFeed(
          currency,
          1,
          [mockPriceFeed.address],
          [86400],
        ),
      ).to.be.revertedWith('InvalidPriceFeed');
    });

    it('Fail to update the price feed due to stale price feed with zero price', async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mockPriceFeed.mock.latestRoundData.returns(0, 0, 0, now, 0);

      await expect(
        currencyControllerProxy.updatePriceFeed(
          currency,
          1,
          [mockPriceFeed.address],
          [86400],
        ),
      ).to.be.revertedWith('InvalidPriceFeed');
    });
  });

  describe('Convert', async () => {
    let currency: string;

    beforeEach(async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      currency = ethers.utils.formatBytes32String(`Test${testIdx}`);
      testIdx++;

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(
        0,
        10000000000,
        0,
        now,
        0,
      );
      await mockPriceFeed.mock.decimals.returns(18);

      await currencyControllerProxy.addCurrency(
        currency,
        18,
        9000,
        [mockPriceFeed.address],
        [86400],
      );
    });

    it('Get the converted amount(int256) in the base currency', async () => {
      const amount = await currencyControllerProxy[
        'convertToBaseCurrency(bytes32,int256)'
      ](currency, 10000000000);

      expect(amount).to.equal('100');

      const zeroAmount = await currencyControllerProxy[
        'convertToBaseCurrency(bytes32,int256)'
      ](currency, 0);

      expect(zeroAmount).to.equal('0');
    });

    it('Get the converted amount(uint256) in the base currency', async () => {
      const amount = await currencyControllerProxy[
        'convertToBaseCurrency(bytes32,uint256)'
      ](currency, 10000000000);

      expect(amount).to.equal('100');

      const zeroAmount = await currencyControllerProxy[
        'convertToBaseCurrency(bytes32,uint256)'
      ](currency, 0);

      expect(zeroAmount).to.equal('0');
    });

    it('Get the array of converted amounts(uint256[]) in the base currency', async () => {
      const amounts = await currencyControllerProxy[
        'convertToBaseCurrency(bytes32,uint256[])'
      ](currency, [10000000000]);

      expect(amounts.length).to.equal(1);
      expect(amounts[0]).to.equal('100');

      const zeroAmounts = await currencyControllerProxy[
        'convertToBaseCurrency(bytes32,uint256[])'
      ](currency, [0]);

      expect(zeroAmounts.length).to.equal(1);
      expect(zeroAmounts[0]).to.equal('0');
    });

    it('Get the converted amount(uint256) in the selected currency', async () => {
      const amount = await currencyControllerProxy[
        'convertFromBaseCurrency(bytes32,uint256)'
      ](currency, 10000000000);

      expect(amount).to.equal('1000000000000000000');

      const zeroAmount = await currencyControllerProxy[
        'convertFromBaseCurrency(bytes32,uint256)'
      ](currency, 0);

      expect(zeroAmount).to.equal('0');
    });

    it('Get the converted amount(uint256) in the selected currency', async () => {
      const amounts = await currencyControllerProxy[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ](currency, [10000000000]);

      expect(amounts.length).to.equal(1);
      expect(amounts[0]).to.equal('1000000000000000000');

      const zeroAmounts = await currencyControllerProxy[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ](currency, [0]);

      expect(zeroAmounts.length).to.equal(1);
      expect(zeroAmounts[0]).to.equal('0');
    });

    it('Get the converted amount in the selected currency from another selected currency', async () => {
      const currency2 = ethers.utils.formatBytes32String(`TestCcy1`);
      const mockPriceFeed2 = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );

      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mockPriceFeed2.mock.latestRoundData.returns(
        0,
        5000000000,
        0,
        now,
        0,
      );
      await mockPriceFeed2.mock.decimals.returns(18);

      await currencyControllerProxy.addCurrency(
        currency2,
        18,
        9000,
        [mockPriceFeed2.address],
        [86400],
      );

      const amount = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256)'
      ](currency, currency2, 10000000000);

      expect(amount).to.equal(20000000000);

      const amount2 = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256)'
      ](currency, currency, 10000000000);

      expect(amount2).to.equal(10000000000);

      const zeroAmount = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256)'
      ](currency, currency2, 0);

      expect(zeroAmount).to.equal('0');
    });

    it('Get the converted amounts in the selected currency from another selected currency', async () => {
      const currency2 = ethers.utils.formatBytes32String(`TestCcy2`);
      const mockPriceFeed2 = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );

      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mockPriceFeed2.mock.latestRoundData.returns(
        0,
        5000000000,
        0,
        now,
        0,
      );
      await mockPriceFeed2.mock.decimals.returns(18);

      await currencyControllerProxy.addCurrency(
        currency2,
        18,
        9000,
        [mockPriceFeed2.address],
        [86400],
      );

      const amounts = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256[])'
      ](currency, currency2, [10000000000]);

      expect(amounts.length).to.equal(1);
      expect(amounts[0]).to.equal(20000000000);

      const amounts2 = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256[])'
      ](currency, currency, [10000000000]);

      expect(amounts2.length).to.equal(1);
      expect(amounts2[0]).to.equal(10000000000);

      const zeroAmounts = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256[])'
      ](currency, currency2, [0]);

      expect(zeroAmounts.length).to.equal(1);
      expect(zeroAmounts[0]).to.equal('0');
    });

    it('Get the converted amounts in the selected currency from another selected currency from 0', async () => {
      const currency3 = ethers.utils.formatBytes32String(`TestCcy3`);
      await currencyControllerProxy.addCurrency(
        currency3,
        18,
        9000,
        [mockPriceFeed.address],
        [86400],
      );

      const zeroAmounts = await currencyControllerProxy[
        'convert(bytes32,bytes32,uint256[])'
      ](currency, currency3, [0]);

      expect(zeroAmounts.length).to.equal(1);
      expect(zeroAmounts[0]).to.equal(0);
    });

    it('Fail to get the converted amount due to stale price feed with old timestamp', async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mockPriceFeed.mock.latestRoundData.returns(
        0,
        10000000000,
        0,
        now - 86400 - 60 * 5,
        0,
      );

      await expect(
        currencyControllerProxy['convertToBaseCurrency(bytes32,int256)'](
          currency,
          10000000000,
        ),
      ).to.be.revertedWith('StalePriceFeed');
    });

    it('Fail to get the converted amount due to stale price feed with zero price', async () => {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mockPriceFeed.mock.latestRoundData.returns(0, 0, 0, now, 0);

      await expect(
        currencyControllerProxy['convertToBaseCurrency(bytes32,int256)'](
          currency,
          10000000000,
        ),
      ).to.be.revertedWith('StalePriceFeed');
    });
  });
});
