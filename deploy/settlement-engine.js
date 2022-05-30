module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');
  const wETHToken = await deployments.get('WETH9Mock');

  const settlementEngine = await deploy('SettlementEngine', {
    from: deployer,
    args: [addressResolver.address, wETHToken.address],
  });

  console.log('Deployed SettlementEngine at ' + settlementEngine.address);
};

module.exports.tags = ['SettlementEngine'];
module.exports.dependencies = ['AddressResolver', 'WETH'];
