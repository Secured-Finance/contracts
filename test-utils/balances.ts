import { expect } from 'chai';

const checkTokenBalances = async (parties, balances, token) => {
  for (let i = 0; i < parties.length; i++) {
    let actualBalance = await token.balanceOf(parties[i]);
    expect(actualBalance.toString()).to.equal(balances[i].toString());
  }
};

const allowances = async (account, withdrawer, allowances) => {
  let index = allowances.length;
  while (index--) {
    if (
      (await allowances[index][0].allowance(account, withdrawer)).toNumber() !==
      allowances[index][1]
    ) {
      return false;
    }
  }
  return true;
};

const balances = async (account, balances) => {
  let index = balances.length;
  while (index--) {
    // length 3 is for ERC1155 [token, id, amount]
    if (balances[index].length === 3) {
      if (
        (
          await balances[index][0].balanceOf(account, balances[index][1])
        ).toNumber() !== balances[index][2]
      ) {
        return false;
      }
    }
    // length 2 is for ERC20 and ERC721 [token, amount]
    else if (
      (await balances[index][0].balanceOf(account)).toNumber() !==
      balances[index][1]
    ) {
      return false;
    }
  }
  return true;
};

export { checkTokenBalances, allowances, balances };
