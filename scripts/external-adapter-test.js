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

  const timeLibrary = await deploy('BokkyPooBahsDateTimeContract', {
    from: deployer,
  });
  console.log('Deployed timeLibrary at ' + timeLibrary.address);

  const timeLibraryContract = await ethers.getContractAt(
    'BokkyPooBahsDateTimeContract',
    timeLibrary.address,
  );

  const addressResolver = await deploy('AddressResolver', {
    from: deployer,
  });
  console.log('Deployed AddressResolver at ' + addressResolver.address);

  const addressResolverContract = await ethers.getContractAt(
    'AddressResolver',
    addressResolver.address,
  );

  const paymentAggregator = await deploy('PaymentAggregator', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log('Deployed PaymentAggregator at ' + paymentAggregator.address);

  const paymentAggregatorContract = await ethers.getContractAt(
    'PaymentAggregator',
    paymentAggregator.address,
  );

  const currencyController = await deploy('CurrencyController', {
    from: deployer,
  });
  console.log('Deployed CurrencyController at ' + currencyController.address);

  const timeSlotTest = await deploy('TimeSlotTest', {
    from: deployer,
  });
  console.log('Deployed TimeSlotTest at ' + timeSlotTest.address);

  const markToMarketMock = await deploy('MarkToMarketMock', {
    from: deployer,
  });
  console.log('Deployed MarkToMarketMock at ' + markToMarketMock.address);

  const crosschainAddressResolver = await deploy('CrosschainAddressResolver', {
    from: deployer,
    args: [addressResolver.address],
  });

  const crosschainAddressResolverContract = await ethers.getContractAt(
    'CrosschainAddressResolver',
    crosschainAddressResolver.address,
  );

  console.log(
    'Deployed CrosschainAddressResolver at ' +
      crosschainAddressResolver.address,
  );

  const filToETHPriceFeed = await deploy('MockV3Aggregator', {
    from: deployer,
    args: [18, hexFILString, filToETHRate.toString()],
  });
  console.log('Deployed MockV3Aggregator at ' + filToETHPriceFeed.address);

  const currencyControllerContract = await ethers.getContractAt(
    'CurrencyController',
    currencyController.address,
  );

  await (
    await currencyControllerContract.supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    )
  ).wait();

  const SettlementEngineFactory = await ethers.getContractFactory(
    'SettlementEngine',
  );

  const settlementEngine = await deploy('SettlementEngine', {
    from: deployer,
    args: [addressResolver.address, zeroAddress],
  });

  const settlementEngineContract = await ethers.getContractAt(
    'SettlementEngine',
    settlementEngine.address,
  );

  console.log(
    'Deployed SettlementEngine at ' + settlementEngineContract.address,
  );

  const closeOutNetting = await deploy('CloseOutNetting', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log('Deployed CloseOutNetting at ' + closeOutNetting.address);

  const aggregatorCaller = await deploy('PaymentAggregatorCallerMock', {
    from: deployer,
    args: [paymentAggregator.address],
  });
  const aggregatorCallerContract = await ethers.getContractAt(
    'PaymentAggregatorCallerMock',
    aggregatorCaller.address,
  );

  console.log(
    'Deployed PaymentAggregatorCallerMock at ' + aggregatorCaller.address,
  );

  await (
    await addressResolverContract.importAddresses(
      [
        'CloseOutNetting',
        'CrosschainAddressResolver',
        'CurrencyController',
        'Loan',
        'MarkToMarket',
        'PaymentAggregator',
        'SettlementEngine',
      ].map(toBytes32),
      [
        closeOutNetting.address,
        crosschainAddressResolver.address,
        currencyController.address,
        aggregatorCaller.address,
        markToMarketMock.address,
        paymentAggregator.address,
        settlementEngine.address,
      ],
    )
  ).wait();

  const migrationAddressResolver = await deploy('MigrationAddressResolver', {
    from: deployer,
  });
  console.log(
    'Deployed MigrationAddressResolver at ' + migrationAddressResolver.address,
  );
  const migrationAddressResolverContract = await ethers.getContractAt(
    'MigrationAddressResolver',
    migrationAddressResolver.address,
  );

  const buildCachesAddresses = [
    closeOutNetting.address,
    paymentAggregator.address,
    settlementEngine.address,
  ];
  await (
    await migrationAddressResolverContract.buildCaches(buildCachesAddresses)
  ).wait();

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

  console.log('LinkToken Address is ' + linkTokenAddress);

  const linkTokenContract = await ethers.getContractAt(
    'LinkToken',
    linkTokenAddress,
  );

  const oracleOperator = await deploy('Operator', {
    from: deployer,
    args: [linkTokenAddress, deployer],
  });
  console.log('Deployed Operator at ' + oracleOperator.address);
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
    'Deployed ChainlinkSettlementAdapter at ' + settlementAdapter.address,
  );

  await (
    await linkTokenContract.transfer(
      settlementAdapter.address,
      '10000000000000000000',
    )
  ).wait();

  await (
    await oracleOperatorContract.setAuthorizedSenders([chainlinkNode])
  ).wait();

  await (
    await settlementEngineContract.addExternalAdapter(
      settlementAdapter.address,
      hexFILString,
    )
  ).wait();

  await (
    await crosschainAddressResolverContract
      .connect(deployerSigner)
      .functions['updateAddress(uint256,string)'](461, aliceAddress)
  ).wait();

  await (
    await crosschainAddressResolverContract
      .connect(aliceSigner)
      .functions['updateAddress(uint256,string)'](461, bobAddress)
  ).wait();

  now = await getLatestTimestamp();
  const slotTime = await timeLibraryContract.addDays(now, 1);

  const amount = '13800000000000000000';

  await (
    await aggregatorCallerContract.registerPayments(
      deployer,
      alice,
      hexFILString,
      firstDealId,
      [slotTime],
      [amount],
      [0],
    )
  ).wait();

  const requestId = await (
    await settlementEngineContract
      .connect(deployerSigner)
      .verifyPayment(alice, hexFILString, amount, slotTime.toString(), txHash)
  ).wait();

  const deployerRequestId =
    requestId.events[requestId.events.length - 1].args.requestId;
  console.log(deployerRequestId);
};

module.exports.tags = ['TestRinkeby'];
