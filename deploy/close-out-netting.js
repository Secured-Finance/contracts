module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');

  const closeOutNetting = await deploy('CloseOutNetting', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log('Deployed CloseOutNetting at ' + closeOutNetting.address);
};

module.exports.tags = ['CloseOutNetting'];
module.exports.dependencies = ['AddressResolver'];
