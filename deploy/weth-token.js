module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const wETHToken = await deploy('WETH9Mock', { from: deployer });
  console.log('Deployed wETHToken at ' + wETHToken.address);
};

module.exports.tags = ['WETH'];
