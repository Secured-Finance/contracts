const { hexETHString, toBytes32 } = require('../test-utils').strings;

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

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const collateralAggregator = await proxyController
    .getProxyAddress(toBytes32('CollateralAggregator'))
    .then((address) => ethers.getContractAt('CollateralAggregatorV2', address));

  await collateralAggregator
    .linkCollateralVault(ethVault.address)
    .then((tx) => tx.wait());

  await ethVaultContract.functions['deposit(uint256)']('10000000000000000', {
    value: '10000000000000000',
  }).then((tx) => tx.wait());
};

module.exports.tags = ['CollateralVaults'];
module.exports.dependencies = ['AddressResolver', 'Migration', 'WETH'];
