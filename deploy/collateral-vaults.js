const { hexETHString } = require('../test-utils').strings;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');
  const wETHToken = await deployments.get('WETH9Mock');

  const ethVault = await deploy('CollateralVault', {
    from: deployer,
    args: [
      addressResolver.address,
      hexETHString,
      wETHToken.address,
      wETHToken.address,
    ],
  });
  console.log('Deployed ETH CollateralVault at ' + ethVault.address);

  const ethVaultContract = await ethers.getContractAt(
    'CollateralVault',
    ethVault.address,
  );
  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const collateralAggregatorContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );

  await (
    await collateralAggregatorContract.linkCollateralVault(ethVault.address)
  ).wait();
  await (
    await ethVaultContract.functions['deposit(uint256)']('10000000000000000', {
      value: '10000000000000000',
    })
  ).wait();
};

module.exports.tags = ['CollateralVaults'];
module.exports.dependencies = ['AddressResolver', 'Migration', 'WETH'];
