module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const paymentAggregator = await deployments.get('PaymentAggregator');
  const currencyController = await deployments.get('CurrencyController');
  const crosschainResolver = await deployments.get('CrosschainAddressResolver');
  const wETHToken = await deployments.get('WETH9Mock');

  const paymentAggregatorContract = await ethers.getContractAt(
    'PaymentAggregator',
    paymentAggregator.address,
  );

  const settlementEngine = await deploy('SettlementEngine', {
    from: deployer,
    args: [
      paymentAggregator.address,
      currencyController.address,
      crosschainResolver.address,
      wETHToken.address,
    ],
  });

  console.log('Deployed SettlementEngine at ' + settlementEngine.address);

  await (
    await paymentAggregatorContract.setSettlementEngine(
      settlementEngine.address,
    )
  ).wait();
};

module.exports.tags = ['SettlementEngine'];
module.exports.dependencies = [
  'PaymentAggregator',
  'CurrencyController',
  'CrossChainAddressResolver',
  'CollateralAggregator',
];
