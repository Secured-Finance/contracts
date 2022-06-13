module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const closeOutNetting = await deploy('CloseOutNetting', { from: deployer });
  console.log('Deployed CloseOutNetting at ' + closeOutNetting.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const tx = await proxyController.setCloseOutNettingImpl(
    closeOutNetting.address,
  );
  await tx.wait();
};

module.exports.tags = ['CloseOutNetting'];
module.exports.dependencies = ['ProxyController'];
