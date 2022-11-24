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

  let testIdx = 0;

  before(async () => {
    [owner] = await ethers.getSigners();

    // Set up for the mocks
    mockPriceFeed = await deployMockContract(owner, MockV3Aggregator.abi);

    // Deploy
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const currencyController = await deployContract(owner, CurrencyController);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);

    const currencyControllerAddress = await proxyController
      .setCurrencyControllerImpl(currencyController.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );

    currencyControllerProxy = await ethers.getContractAt(
      'CurrencyController',
      currencyControllerAddress,
    );
  });

  describe('Initialize', async () => {
    it('Add ETH as a supported currency', async () => {
      const name = 'ETH';
      const currency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.supportCurrency(
          currency,
          name,
          mockPriceFeed.address,
          9000,
        ),
      )
        .to.emit(currencyControllerProxy, 'AddPriceFeed')
        .withArgs(currency, 'USD', mockPriceFeed.address);

      await currencyControllerProxy
        .getCurrency(currency)
        .then(({ isSupported, name }) => {
          expect(isSupported).to.equal(true);
          expect(name).to.equal(name);
        });

      await currencyControllerProxy
        .getCurrency(ethers.utils.formatBytes32String('TEST'))
        .then(({ isSupported }) => expect(isSupported).to.equal(false));

      await currencyControllerProxy
        .getUsdDecimals(currency)
        .then((decimals) => expect(decimals).to.equal(18));

      await currencyControllerProxy
        .getHaircut(currency)
        .then((haircut) => expect(haircut).to.equal(9000));

      await currencyControllerProxy
        .isSupportedCcy(currency)
        .then((isSupported) => expect(isSupported).to.true);
    });

    it('Add a currency except for ETH as a supported currency', async () => {
      const name = 'FIL';
      const currency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.supportCurrency(
          currency,
          name,
          mockPriceFeed.address,
          8000,
        ),
      )
        .to.emit(currencyControllerProxy, 'AddPriceFeed')
        .withArgs(currency, 'ETH', mockPriceFeed.address);

      await currencyControllerProxy
        .getEthDecimals(currency)
        .then((decimals) => expect(decimals).to.equal(18));
    });

    it('Fail to add ETH as a supported currency due to the invalid price feed', async () => {
      const name = 'ETH';
      const currency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, -1, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.supportCurrency(
          currency,
          name,
          mockPriceFeed.address,
          8000,
        ),
      ).to.be.revertedWith('Invalid PriceFeed');
    });

    it('Fail to add ETH as a supported currency due to the invalid decimals', async () => {
      const name = 'ETH';
      const currency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(19);

      await expect(
        currencyControllerProxy.supportCurrency(
          currency,
          name,
          mockPriceFeed.address,
          8000,
        ),
      ).to.be.revertedWith('Invalid decimals');
    });
  });

  describe('Update', async () => {
    let currency: string;

    beforeEach(async () => {
      const name = `Test${testIdx}`;
      testIdx++;
      currency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await currencyControllerProxy.supportCurrency(
        currency,
        name,
        mockPriceFeed.address,
        9000,
      );
    });

    it('Update a currency support', async () => {
      await expect(
        currencyControllerProxy.updateCurrencySupport(currency, false),
      )
        .to.emit(currencyControllerProxy, 'UpdateSupportCurrency')
        .withArgs(currency, false);

      expect(await currencyControllerProxy.isSupportedCcy(currency)).to.equal(
        false,
      );
    });

    it('Update a haircut', async () => {
      await expect(currencyControllerProxy.updateHaircut(currency, 10))
        .to.emit(currencyControllerProxy, 'UpdateHaircut')
        .withArgs(currency, 10);

      expect(await currencyControllerProxy.getHaircut(currency)).to.equal(10);
    });

    it('Update an ETH price feed', async () => {
      // Set up for the mocks
      const newMockPriceFeed = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed.mock.latestRoundData.returns(0, 200, 0, 0, 0);
      await newMockPriceFeed.mock.getRoundData.returns(0, 300, 0, 1000, 0);
      await newMockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.linkPriceFeed(
          currency,
          newMockPriceFeed.address,
          true,
        ),
      )
        .to.emit(currencyControllerProxy, 'AddPriceFeed')
        .withArgs(currency, 'ETH', newMockPriceFeed.address);

      expect(await currencyControllerProxy.getLastETHPrice(currency)).to.equal(
        200,
      );
      expect(
        await currencyControllerProxy.getHistoricalETHPrice(currency, 0),
      ).to.equal(300);
    });

    it('Update a none ETH price feed', async () => {
      // Set up for the mocks
      const newMockPriceFeed = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed.mock.latestRoundData.returns(0, 400, 0, 0, 0);
      await newMockPriceFeed.mock.getRoundData.returns(0, 500, 0, 1000, 0);
      await newMockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.linkPriceFeed(
          currency,
          newMockPriceFeed.address,
          false,
        ),
      )
        .to.emit(currencyControllerProxy, 'AddPriceFeed')
        .withArgs(currency, 'USD', newMockPriceFeed.address);

      expect(await currencyControllerProxy.getLastUSDPrice(currency)).to.equal(
        400,
      );
      expect(
        await currencyControllerProxy.getHistoricalUSDPrice(currency, 0),
      ).to.equal(500);
    });

    it('Remove an ETH price feed', async () => {
      // Set up for the mocks
      const newMockPriceFeed = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed.mock.latestRoundData.returns(0, 200, 0, 0, 0);
      await newMockPriceFeed.mock.getRoundData.returns(0, 300, 0, 1000, 0);
      await newMockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.linkPriceFeed(
          currency,
          newMockPriceFeed.address,
          true,
        ),
      ).to.emit(currencyControllerProxy, 'AddPriceFeed');

      await expect(currencyControllerProxy.removePriceFeed(currency, true))
        .to.emit(currencyControllerProxy, 'RemovePriceFeed')
        .withArgs(currency, 'ETH', newMockPriceFeed.address);
    });

    it('Remove a none ETH price feed', async () => {
      // Set up for the mocks
      const newMockPriceFeed = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed.mock.latestRoundData.returns(0, 200, 0, 0, 0);
      await newMockPriceFeed.mock.getRoundData.returns(0, 300, 0, 1000, 0);
      await newMockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.linkPriceFeed(
          currency,
          newMockPriceFeed.address,
          false,
        ),
      ).to.emit(currencyControllerProxy, 'AddPriceFeed');

      await expect(currencyControllerProxy.removePriceFeed(currency, false))
        .to.emit(currencyControllerProxy, 'RemovePriceFeed')
        .withArgs(currency, 'USD', newMockPriceFeed.address);
    });

    it('Fail to update an ETH price feed due to the none ETH currency', async () => {
      // Set up for the mocks
      const newMockPriceFeed = await deployMockContract(
        owner,
        MockV3Aggregator.abi,
      );
      await newMockPriceFeed.mock.latestRoundData.returns(0, 0, 0, 0, 0);
      await newMockPriceFeed.mock.getRoundData.returns(0, 0, 0, 0, 0);
      await newMockPriceFeed.mock.decimals.returns(18);

      await expect(
        currencyControllerProxy.linkPriceFeed(
          ethers.utils.formatBytes32String('ETH'),
          newMockPriceFeed.address,
          true,
        ),
      ).to.be.revertedWith("Can't link to ETH");
    });

    it('Fail to update a haircut due to incorrect ratio', async () => {
      await expect(
        currencyControllerProxy.updateHaircut(currency, 0),
      ).to.be.revertedWith('Incorrect haircut ratio');
    });

    it('Fail to update a haircut due to overflow', async () => {
      await expect(
        currencyControllerProxy.updateHaircut(currency, 10001),
      ).to.be.revertedWith('Haircut ratio overflow');
    });

    it('Fail to remove an ETH price feed due to invalid PriceFeed', async () => {
      const name = 'ETH';
      testIdx++;
      const dummyCurrency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await currencyControllerProxy.supportCurrency(
        dummyCurrency,
        name,
        mockPriceFeed.address,
        9000,
      );

      await expect(
        currencyControllerProxy.removePriceFeed(dummyCurrency, true),
      ).to.be.revertedWith('Invalid PriceFeed');
    });

    it('Fail to remove a none ETH price feed due to invalid PriceFeed', async () => {
      const name = 'Dummy';
      testIdx++;
      const dummyCurrency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await currencyControllerProxy.supportCurrency(
        dummyCurrency,
        name,
        mockPriceFeed.address,
        9000,
      );

      await expect(
        currencyControllerProxy.removePriceFeed(dummyCurrency, false),
      ).to.be.revertedWith('Invalid PriceFeed');
    });
  });

  describe('Convert', async () => {
    let currency: string;

    beforeEach(async () => {
      const name = `Test${testIdx}`;
      testIdx++;
      currency = ethers.utils.formatBytes32String(name);

      // Set up for the mocks
      await mockPriceFeed.mock.latestRoundData.returns(0, 10000000000, 0, 0, 0);
      await mockPriceFeed.mock.decimals.returns(18);

      await currencyControllerProxy.supportCurrency(
        currency,
        name,
        mockPriceFeed.address,
        9000,
      );
    });

    it('Get the converted amount(int256) in ETH', async () => {
      const amount = await currencyControllerProxy[
        'convertToETH(bytes32,int256)'
      ](currency, 10000000000);

      expect(amount).to.equal('100');
    });

    it('Get the converted amount(uint256) in ETH', async () => {
      const amount = await currencyControllerProxy[
        'convertToETH(bytes32,uint256)'
      ](currency, 10000000000);

      expect(amount).to.equal('100');
    });

    it('Get the array of converted amount(uint256[]) in ETH', async () => {
      const amounts = await currencyControllerProxy[
        'convertToETH(bytes32,uint256[])'
      ](currency, [10000000000]);

      expect(amounts.length).to.equal(1);
      expect(amounts[0]).to.equal('100');
    });

    it('Get the converted amount(uint256) in the selected currency', async () => {
      const amount = await currencyControllerProxy.convertFromETH(
        currency,
        10000000000,
      );

      expect(amount).to.equal('1000000000000000000');
    });

    it('Fail to get the converted amount(uint256) in the selected currency due to small amount', async () => {
      await mockPriceFeed.mock.latestRoundData.returns(
        0,
        '10000000000000000000000',
        0,
        0,
        0,
      );
      await expect(
        currencyControllerProxy.convertFromETH(currency, 1000),
      ).to.be.revertedWith('Too small amount');
    });
  });
});
