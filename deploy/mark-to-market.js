module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const markToMarket = await deploy('MarkToMarket', {
    from: deployer,
  });
  console.log('Deployed MarkToMarket at ' + markToMarket.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setMarkToMarketImpl(markToMarket.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['MarkToMarket'];
module.exports.dependencies = ['ProxyController'];
