module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const productResolver = await deployments.get('ProductAddressResolver');
  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const currencyController = await deployments.get('CurrencyController');
  const collateralContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );

  const liquidations = await deploy('Liquidations', {
    from: deployer,
    args: [deployer, 10],
  });
  console.log('Deployed Liquidations at ' + liquidations.address);

  const liquidationsContract = await ethers.getContractAt(
    'Liquidations',
    liquidations.address,
  );

  await (
    await liquidationsContract.setCollateralAggregator(
      collateralAggregator.address,
      { from: deployer },
    )
  ).wait();
  await (
    await liquidationsContract.setProductAddressResolver(
      productResolver.address,
      { from: deployer },
    )
  ).wait();
  await (
    await liquidationsContract.setCurrencyController(
      currencyController.address,
      { from: deployer },
    )
  ).wait();
  await (
    await collateralContract.setLiquidationEngine(liquidations.address)
  ).wait();
};

module.exports.tags = ['Liquidations'];
module.exports.dependencies = [
  'ProductAddressResolver',
  'CollateralAggregator',
  'CurrencyController',
];
