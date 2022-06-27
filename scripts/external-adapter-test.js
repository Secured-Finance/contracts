const { toBytes32, zeroAddress, hexFILString } =
  require('../test-utils/').strings;
const { oracleRequestFee, filToETHRate } = require('../test-utils').numbers;
const { getLatestTimestamp } = require('../test-utils').time;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, getNetworkName } = deployments;
  const { deployer, alice } = await getNamedAccounts();
  const network = getNetworkName();

  signers = await ethers.getSigners();
  deployerSigner = signers[0];
  aliceSigner = signers[1];

  const firstDealId =
    '0x21aaa47b00000000000000000000000000000000000000000000000000000001';

  const aliceAddress =
    'f3rqoy6o46w4q4ghzd6hzsxvdqdrso6pvrx2peslqwiza35p4aaoq6lo53dtnpggde5tyce2if4ex5wlvyfe7q';
  const bobAddress = 'f1t6anejmdka4ak7irn3kb3fjelzbb45hd6ybkfaa';
  const jobId =
    '0x3863356238303064333165633439633138303465663832376265383163306663';
  const chainlinkNode = '0x8f36C9d202b5c21a01E1d7315694F0b82a448d19';
  const txHash =
    'bafy2bzaceanaf4la2vict62g3o6443kkqelgrmhouqlir2knip2tg5ows25ws';
  let linkTokenAddress;

  // Deploy libraries
  const timeLibrary = await deploy('BokkyPooBahsDateTimeContract', {
    from: deployer,
  });
  console.log('Deployed timeLibrary at', timeLibrary.address);

  const timeLibraryContract = await ethers.getContractAt(
    'BokkyPooBahsDateTimeContract',
    timeLibrary.address,
  );

  // Deploy contracts
  const addressResolver = await deploy('AddressResolver', {
    from: deployer,
  }).then(({ address }) => ethers.getContractAt('AddressResolver', address));
  console.log('Deployed AddressResolver at', addressResolver.address);

  const closeOutNetting = await deploy('CloseOutNetting', { from: deployer });
  console.log('Deployed CloseOutNetting at', closeOutNetting.address);

  const paymentAggregator = await deploy('PaymentAggregator', {
    from: deployer,
  });
  console.log('Deployed PaymentAggregator at', paymentAggregator.address);

  const currencyController = await deploy('CurrencyController', {
    from: deployer,
  });
  console.log('Deployed CurrencyController at', currencyController.address);

  const timeSlotTest = await deploy('TimeSlotTest', { from: deployer });
  console.log('Deployed TimeSlotTest at', timeSlotTest.address);

  const markToMarketMock = await deploy('MarkToMarketMock', { from: deployer });
  console.log('Deployed MarkToMarketMock at', markToMarketMock.address);

  const crosschainAddressResolver = await deploy('CrosschainAddressResolver', {
    from: deployer,
  });
  console.log(
    'Deployed CrosschainAddressResolver at',
    crosschainAddressResolver.address,
  );

  const settlementEngine = await deploy('SettlementEngine', { from: deployer });
  console.log('Deployed SettlementEngine at', settlementEngine.address);

  // Set contract addresses to the Proxy contract
  const proxyController = await deploy('ProxyController', {
    from: deployer,
    args: [addressResolver.address],
  }).then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController.setCloseOutNettingImpl(closeOutNetting.address);
  await proxyController.setCrosschainAddressResolverImpl(
    crosschainAddressResolver.address,
  );
  await proxyController.setCurrencyControllerImpl(currencyController.address);
  await proxyController.setMarkToMarketImpl(markToMarketMock.address);
  await proxyController.setPaymentAggregatorImpl(paymentAggregator.address);
  await proxyController.setSettlementEngineImpl(
    settlementEngine.address,
    zeroAddress,
  );

  // Get contracts from proxyController
  const closeOutNettingProxy = await proxyController
    .getAddress(toBytes32('CloseOutNetting'))
    .then((address) => ethers.getContractAt('CloseOutNetting', address));

  const crosschainAddressResolverProxy = await proxyController
    .getAddress(toBytes32('CrosschainAddressResolver'))
    .then((address) =>
      ethers.getContractAt('CrosschainAddressResolver', address),
    );

  const currencyControllerProxy = await proxyController
    .getAddress(toBytes32('CurrencyController'))
    .then((address) => ethers.getContractAt('CurrencyController', address));

  const markToMarketMockProxy = await proxyController
    .getAddress(toBytes32('MarkToMarket'))
    .then((address) => ethers.getContractAt('MarkToMarketMock', address));

  const paymentAggregatorProxy = await proxyController
    .getAddress(toBytes32('PaymentAggregator'))
    .then((address) => ethers.getContractAt('PaymentAggregator', address));

  const settlementEngineProxy = await proxyController
    .getAddress(toBytes32('SettlementEngine'))
    .then((address) => ethers.getContractAt('SettlementEngine', address));

  // Deploy mock contracts
  const filToETHPriceFeed = await deploy('MockV3Aggregator', {
    from: deployer,
    args: [18, hexFILString, filToETHRate.toString()],
  });
  console.log('Deployed MockV3Aggregator at', filToETHPriceFeed.address);

  await currencyControllerProxy
    .supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    )
    .then((tx) => tx.wait());

  const aggregatorCaller = await deploy('PaymentAggregatorCallerMock', {
    from: deployer,
    args: [paymentAggregatorProxy.address],
  }).then(({ address }) =>
    ethers.getContractAt('PaymentAggregatorCallerMock', address),
  );

  console.log(
    'Deployed PaymentAggregatorCallerMock at',
    aggregatorCaller.address,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  await addressResolver
    .importAddresses(
      [
        'CloseOutNetting',
        'CrosschainAddressResolver',
        'CurrencyController',
        'MarkToMarket',
        'PaymentAggregator',
        'ProductAddressResolver',
        'SettlementEngine',
      ].map(toBytes32),
      [
        closeOutNettingProxy.address,
        crosschainAddressResolverProxy.address,
        currencyControllerProxy.address,
        markToMarketMockProxy.address,
        paymentAggregatorProxy.address,
        aggregatorCaller.address,
        settlementEngineProxy.address,
      ],
    )
    .then((tx) => tx.wait());

  const migrationAddressResolver = await deploy('MigrationAddressResolver', {
    from: deployer,
  }).then(({ address }) =>
    ethers.getContractAt('MigrationAddressResolver', address),
  );
  console.log(
    'Deployed MigrationAddressResolver at',
    migrationAddressResolver.address,
  );

  const buildCachesAddresses = [
    closeOutNettingProxy.address,
    paymentAggregatorProxy.address,
    settlementEngineProxy.address,
  ];

  await migrationAddressResolver
    .buildCaches(buildCachesAddresses)
    .then((tx) => tx.wait());

  // Set up for ChainlinkSettlementAdapter
  switch (network) {
    case 'rinkeby': {
      linkTokenAddress = '0x01BE23585060835E02B77ef475b0Cc51aA1e0709';
      break;
    }
    default: {
      const linkToken = await deploy('LinkToken', {
        from: deployer,
      });
      linkTokenAddress = linkToken.address;
      break;
    }
  }

  console.log('LinkToken Address is', linkTokenAddress);

  const linkTokenContract = await ethers.getContractAt(
    'LinkToken',
    linkTokenAddress,
  );

  const oracleOperator = await deploy('Operator', {
    from: deployer,
    args: [linkTokenAddress, deployer],
  });
  console.log('Deployed Operator at', oracleOperator.address);
  const oracleOperatorContract = await ethers.getContractAt(
    'Operator',
    oracleOperator.address,
  );

  const settlementAdapter = await deploy('ChainlinkSettlementAdapter', {
    from: deployer,
    args: [
      addressResolver.address,
      oracleOperator.address,
      jobId,
      oracleRequestFee.toString(),
      linkTokenAddress,
      hexFILString,
    ],
    nonce: 'pending',
  });
  console.log(
    'Deployed ChainlinkSettlementAdapter at',
    settlementAdapter.address,
  );

  await linkTokenContract
    .transfer(settlementAdapter.address, '10000000000000000000')
    .then((tx) => tx.wait());

  await oracleOperatorContract
    .setAuthorizedSenders([chainlinkNode])
    .then((tx) => tx.wait());

  await settlementEngineProxy
    .addExternalAdapter(settlementAdapter.address, hexFILString)
    .then((tx) => tx.wait());

  await crosschainAddressResolverProxy
    .connect(deployerSigner)
    .functions['updateAddress(uint256,string)'](461, aliceAddress)
    .then((tx) => tx.wait());

  await crosschainAddressResolverProxy
    .connect(aliceSigner)
    .functions['updateAddress(uint256,string)'](461, bobAddress)
    .then((tx) => tx.wait());

  now = await getLatestTimestamp();
  const slotTime = await timeLibraryContract.addDays(now, 1);

  const amount = '13800000000000000000';

  await aggregatorCaller
    .registerPayments(
      deployer,
      alice,
      hexFILString,
      firstDealId,
      [slotTime],
      [amount],
      [0],
    )
    .then((tx) => tx.wait());

  const requestId = await settlementEngineProxy
    .connect(deployerSigner)
    .verifyPayment(alice, hexFILString, amount, slotTime.toString(), txHash)
    .then((tx) => tx.wait());

  const deployerRequestId =
    requestId.events[requestId.events.length - 1].args.requestId;
  console.log('RequestId', deployerRequestId);
};

module.exports.tags = ['TestRinkeby'];
