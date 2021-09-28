const toEther = (wei) => {
    return web3.utils.toWei(web3.utils.toBN(wei), 'ether');
}

const toBN = (number) => {
    return web3.utils.toBN(number);
}

module.exports = {
    toEther,
    toBN,
}