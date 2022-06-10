module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const settlementEngine = await deploy('SettlementEngine', {
    from: deployer,
  });

  console.log('Deployed SettlementEngine at ' + settlementEngine.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const wETHToken = await deployments.get('WETH9Mock');

  await proxyController
    .setSettlementEngineImpl(settlementEngine.address, wETHToken.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['SettlementEngine'];
module.exports.dependencies = ['ProxyController', 'WETH'];
