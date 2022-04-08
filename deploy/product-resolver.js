module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');

  const productResolver = await deploy('ProductAddressResolver', {
    from: deployer,
    libraries: {
      DealId: dealIdLibrary.address,
    },
  });
  console.log('Deployed ProductAddressResolver at ' + productResolver.address);
};

module.exports.tags = ['ProductAddressResolver'];
module.exports.dependencies = ['Libraries'];
