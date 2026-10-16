# Lending Market Pre-Order Minimum Amount

## 位置付け

本書は、[`LendingMarketOrderGriefingMitigation.md`](./LendingMarketOrderGriefingMitigation.md) で実装した初期対策に対する追加の修正方針を定義する。

初期対策の「採用しない方針」に記載された「最低注文額または価格ノード作成 fee」は、恒久的に採用しないという意味ではなく、初期実装の対象外であることを示している。本書では、その後に実施した Arbitrum および Filecoin の所要時間・費用調査を踏まえ、pre-order に最低注文額を追加する。

本書は実装前の設計方針であり、関数名および error/event 名は実装時に既存の命名規則へ合わせて調整できる。

## 背景

初期対策により、以下が実装されている。

- `OrderStatisticsTreeLib` の OrderChunk により、同一 `unitPrice`、同一 side で最大 100,000 注文を保持できる。
- `getOrderUnitPriceRange` と注文時 validation により、通常の pre-order で利用できる価格帯を最大 2,001 `unitPrice` に制限する。
- Itayose settlement を複数 transaction に分割できるようにし、大量の pre-order が存在しても Itayose を完了できるようにする。

これらは `executeItayoseCall` が gas 上限によって永続的に実行不能になる問題を解消する。一方、pre-order は Itayose まで約定しないため、攻撃者は長期間にわたり少量注文を追加し、特定の `unitPrice` の 100,000 注文枠を占有できる。

全価格帯を埋める攻撃は時間または gas 費用の面で現実性が低いが、単一または少数の主要価格帯を狙う攻撃は依然として可能である。特に Arbitrum では、単一価格帯の占有は理論上数分、持続可能な throughput を前提としても数時間で実行できる。

### 調査結果の要約

以下は 1 `unitPrice`、1 side 当たり 100,000 注文、通常の pre-order range を 2,001 prices とした概算である。費用は調査時点の network 状況に依存し、セキュリティ上の固定保証値ではない。

| Network  | 攻撃範囲              |                                                 推定所要時間 |                                             推定 transaction fee |
| -------- | --------------------- | -----------------------------------------------------------: | ---------------------------------------------------------------: |
| Filecoin | 1 price / 1 side      |                                              約 6 ～ 18 時間 |                                                      約 12.2 FIL |
| Filecoin | 2,001 prices / 1 side |                                               約 1.4 ～ 4 年 |                                                    約 24,500 FIL |
| Arbitrum | 1 price / 1 side      | 約 1.8 時間（持続可能速度）／約 5.8 分（理論上の最大 burst） |   約 0.89 ETH（execution-only floor）／約 3.04 ETH（観測中央値） |
| Arbitrum | 2,001 prices / 1 side |   約 148 日（持続可能速度）／約 8.1 日（理論上の最大 burst） | 約 1,785 ETH（execution-only floor）／約 6,082 ETH（観測中央値） |

したがって、全価格帯の占有だけを基準に「対応不要」と判断しない。低価格な dust order による局所的な枠の占有も防止対象とする。

## 目的

- `executePreOrder` で経済価値が極端に小さい注文を拒否する。
- 1 `unitPrice` の全 OrderChunk を占有するために必要な資金または担保を十分に引き上げる。
- 通常ユーザーの注文可否を、注文実行中の oracle price や一時的な price feed 障害に依存させない。
- network および currency ごとのリスクに応じて、最低注文額を柔軟に有効化、更新、または無効化できるようにする。
- upgrade 時に既存 order book ごとの migration を必要としない構成にする。
- `executeOrder`、Itayose、注文 cancellation、および既存の価格範囲制限の挙動を変更しない。

## 対象外

- Chunk 利用率、注文数、price level 数の off-chain monitoring
- alert、keeper、indexer、dashboard の追加
- `executeOrder` への最低注文額の追加
- price level 作成 fee または refundable bond
- pre-order の tick size 拡大
- 既存の `MAXIMUM_ORDER_COUNT`、`ORDER_CHUNK_SIZE`、`MAX_ACTIVE_CHUNKS_PER_PRICE` の変更
- on-chain oracle を使用した注文ごとの USD 換算

## 採用する方針

### 1. 通貨単位で最低 pre-order 額を設定する

最低注文額は protocol 全体で共通の USD 値を保存するのではなく、各通貨の最小単位で設定する。

例:

| Currency |    設定例 | 保存値の単位                                        |
| -------- | --------: | --------------------------------------------------- |
| USDC     |    1 USDC | `1_000_000`（decimals = 6）                         |
| ETH      | 0.001 ETH | `1_000_000_000_000_000`（decimals = 18）            |
| WFIL     |    1 WFIL | `1_000_000_000_000_000_000`（decimals = 18 の場合） |

表の値は API の単位を示す例であり、本番設定値を確定するものではない。制限を有効にする currency では、原則として設定時点で少なくとも USD 1 ～ 10 相当となるよう、各通貨の価格、最小注文ニーズ、および collateral requirement を考慮して決定する。

注文実行時に USD 換算しない理由は以下のとおりである。

- price feed の stale/revert によって pre-order が利用不能になることを避ける。
- price update の前後で同じ `_amount` の注文可否が変わることを避ける。
- 注文ごとの外部 price read と換算 gas を追加しない。
- rounding と token decimals の扱いを設定時に一度だけ確定できる。

### 2. LendingMarket ごとに 1 つの設定値を保持する

minimum pre-order amount は order book または maturity ごとに snapshot せず、通貨ごとの LendingMarket に 1 つだけ保持する。各 LendingMarket は単一の currency に対応するため、これは通貨単位の設定となる。

概念上の storage は以下とする。

```solidity
uint256 minimumPreOrderAmount;
```

- `OrderActionLogic.executePreOrder` は実行時点の LendingMarket の `minimumPreOrderAmount` を参照する。
- owner は pre-order 期間中を含め、いつでも値を更新できる。
- 更新後の値は新規 pre-order にのみ適用し、すでに作成済みの注文を無効化、変更、または自動 cancellation しない。
- `createOrderBook`、`rotateOrderBooks` および Itayose process には最低注文額に関する処理を追加しない。
- 同一 currency でも network ごとに deployment と storage が分かれるため、各 network の gas cost、throughput、および脅威に応じた値を設定できる。

この方針により、order book ごとの storage write、nested mapping の参照、snapshot lifecycle、および migration を不要にする。また、pre-order 期間中に新しい攻撃条件や価格変動が確認された場合も、owner が新規注文の最低額を即座に変更できる。

### 3. `0` は制限無効として扱う

LendingMarket の `minimumPreOrderAmount == 0` の場合、その currency では minimum pre-order amount による制限を適用しない。

これにより、以下が可能になる。

- Ethereum のように、transaction fee と所要時間だけで dust-order griefing が十分に非現実的と判断した deployment では制限を無効にする。
- contract upgrade 直後は既存挙動を維持し、必要な currency だけを段階的に有効化する。
- 既存の active order book および pre-order 期間中の order book に対する migration を不要にする。
- 市場や運用上の問題が発生した場合、owner が制限を一時的に解除する。

未設定と意図的な無効化は storage 上で区別しない。この trade-off は、getter、更新 event、deployment configuration、および deployment test で期待値を確認することにより管理する。

### 4. `_amount` を order placement 境界で検証する

`OrderActionLogic.executePreOrder` で、ユーザーが指定した PV amount である `_amount` を LendingMarket の設定値と比較する。

```solidity
uint256 minimumAmount = Storage.slot().minimumPreOrderAmount;

if (_amount < minimumAmount) {
    revert PreOrderAmountTooSmall(_amount, minimumAmount);
}
```

既存処理が `_amount == 0` を拒否するため、`minimumAmount == 0` ではすべての有効な非ゼロ注文が minimum amount validation を通過する。分岐を追加する必要はない。

LendingMarket 内の validation は以下の順序とする。

1. `_unitPrice != 0`
2. `_amount != 0`
3. `_amount >= minimumPreOrderAmount`
4. order book への注文登録

Controller は従来どおり unit price range、fund cleanup、currency/maturity 登録、および collateral coverage を管理する。minimum amount validation は、実際に order book へ注文を登録する LendingMarket 側の共通境界に置く。deposit 付き入口を含め、後段で revert した場合は transaction 全体が rollback される。

### 5. すべての pre-order 入口へ同じ制限を適用する

以下の入口を対象とする。

- `executePreOrder`
- `depositAndExecutesPreOrder`
- `depositWithPermitAndExecutePreOrder`

deposit 付き関数は最終的に `executePreOrder` へ合流するため、共通 logic の validation を必ず通す。validation の revert により deposit、permit、および関連する全 state change も transaction 全体で rollback する。

最低額を wrapper ごとに個別実装せず、判定の不一致を防ぐ。

## 経済的効果

最低注文額を USD 1 相当に設定した場合の、注文 amount の合計は以下となる。

| 攻撃範囲                  |  必要注文数 |   注文 amount の合計 |
| ------------------------- | ----------: | -------------------: |
| 1 price / 1 side          |     100,000 |     USD 100,000 相当 |
| 10 prices / 1 side        |   1,000,000 |   USD 1,000,000 相当 |
| 2,001 prices / 1 side     | 200,100,000 | USD 200,100,000 相当 |
| 2,001 prices / both sides | 400,200,000 | USD 400,200,000 相当 |

最低注文額を USD 10 相当に設定した場合は上記の 10 倍となる。

LEND order では注文資金、BORROW order では collateral coverage が必要になるため、実際の拘束資本は side、通貨、collateral ratio、資産価格によって異なる。また、注文 amount は手数料のように失われる費用ではなく、注文を維持している間の拘束資本である。それでも、100,000 枠を占有し続けるための Sybil address 数、transaction fee、および資本要件を組み合わせることで、1 wei order による現状の攻撃より大幅に実行困難になる。

既存のユーザー当たり最大 20 active orders を前提とすると、1 price / 1 side の占有には少なくとも 5,000 addresses が必要である。

十分な金額と collateral coverage を持つ有効な注文が多数作成された場合、それらは経済的に裏付けられた order book liquidity であり、本対応が防止対象とする低コストな dust-order griefing には該当しない。本対応の目的は注文数そのものを制限することではなく、order capacity の消費量に比例した経済的負担を要求することである。

## External interface

名称は実装時に既存の命名規則へ合わせて調整できる。

```solidity
function getMinimumPreOrderAmount(bytes32 ccy) external view returns (uint256);

function updateMinimumPreOrderAmount(
  bytes32 ccy,
  uint256 amount
) external onlyOwner;

// LendingMarket interface
function getMinimumPreOrderAmount() external view returns (uint256);

function updateMinimumPreOrderAmount(
  uint256 amount
) external onlyLendingMarketController;
```

`updateMinimumPreOrderAmount` は以下の性質を持つ。

- Controller の owner-only setter から対象 LendingMarket の設定更新関数を呼び出す。
- `amount == 0` を受け付ける。
- pre-order 期間を含め、時刻または order book state による更新制限を設けない。
- previous amount と new amount を event に記録する。

既存の `initializeLendingMarket` の引数は変更しない。新規 currency の初期値は `0` であり、制限を有効にする場合は deployment または初期設定処理から `updateMinimumPreOrderAmount` を呼び出す。

## Errors and events

概念上、以下を追加する。

```solidity
error PreOrderAmountTooSmall(uint256 amount, uint256 minimumAmount);

event MinimumPreOrderAmountUpdated(
    bytes32 indexed ccy,
    uint256 previousAmount,
    uint256 newAmount
);
```

`amount == 0` は有効な設定値であるため、zero value 専用の error は追加しない。Getter/setter は既存の `orderFeeRate` および `circuitBreakerLimitRange` と同様に、Controller storage から取得した LendingMarket を直接呼び出し、無効な currency に対する個別の zero-address check は追加しない。

## 実装対象

主な変更対象は以下とする。

| File                                       | 変更内容                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `LendingMarketStorage.sol`                 | currency に対応する `minimumPreOrderAmount` を storage struct 末尾へ追加 |
| `OrderBookLogic.sol`                       | 設定更新処理と更新 event を追加                                          |
| `OrderActionLogic.sol`                     | `executePreOrder` の minimum amount validation を追加                    |
| `LendingMarket.sol` / `ILendingMarket.sol` | getter と Controller-only setter を追加                                  |
| `MixinLendingMarketConfiguration.sol`      | getter と owner-only setter を追加                                       |
| deployment scripts                         | network / currency ごとの設定値を必要に応じて追加                        |
| unit / integration tests                   | validation、設定更新、無効化、各 entry point を追加                      |
| generated protocol docs                    | ABI 変更後に再生成                                                       |

upgradeable storage の互換性を維持するため、新規 field は `LendingMarketStorage.Storage` の末尾へ追加し、既存 field の順序を変更しない。

## Upgrade

新規 mapping の default value は `0` であり、「制限なし」を意味する。このため、既存 deployment の implementation を upgrade しても、既存および新規 pre-order の挙動は自動的には変化しない。

- active order book ごとの migration は行わない。
- versioned initializer は追加しない。
- 既存注文の走査、変更、または cancellation は行わない。
- 制限を有効にする currency についてのみ、upgrade 後に owner が `updateMinimumPreOrderAmount` を実行する。
- 即時有効化が必要な deployment では、upgrade transaction と設定 transaction を連続して実行し、getter と event で設定値を確認する。

設定を有効化または増額した時点ですでに minimum 未満の pre-order が存在しても、その注文には遡及適用しない。更新後の新規 pre-order のみ拒否し、既存注文は従来どおり Itayose またはユーザー操作で処理する。

## Test plan

### Unit tests

- `_amount == minimumAmount` は成功する。
- `_amount == minimumAmount - 1` は `PreOrderAmountTooSmall` で revert する。
- `_amount == 0` は既存の amount error で revert する。
- LEND と BORROW の両方に同じ minimum amount が適用される。
- minimum amount が `0` の場合、すべての非ゼロ amount が minimum validation を通過する。
- owner は minimum amount を `0`、非ゼロ値、より大きい値、およびより小さい値へ更新できる。
- pre-order 期間中の更新が成功し、更新後の新規注文へ即時反映される。
- owner 以外による更新は revert する。
- 無効な currency の setter/getter の挙動が既存規約と一致する。
- 更新 event が previous amount と new amount を正しく記録する。
- minimum amount validation が order book の更新より前に `OrderActionLogic.executePreOrder` で実行される。

### Integration tests

- `executePreOrder`、`depositAndExecutesPreOrder`、`depositWithPermitAndExecutePreOrder` の全経路で同じ境界値になる。
- deposit/permit 付き経路が minimum amount error で revert した場合、deposit と allowance 関連 state が transaction 全体で rollback する。
- minimum 未満の既存 pre-order が存在する状態で設定を増額しても、既存注文を含む Itayose を完了できる。
- minimum amount の更新後は、すべての active maturity で新しい値が参照される。
- `0` への更新後は、すべての active maturity で制限が無効になる。
- valid な minimum amount の注文について、pending amount、collateral coverage、cancellation、Itayose の既存挙動が変わらない。
- price feed が stale または利用不能でも、minimum amount 判定自体は oracle を参照しない。
- upgrade 前後で既存 storage が破損しない。

### Property / fuzz tests

- 任意の minimum `m` に対し、非ゼロの `amount < m` は必ず revert し、`amount >= m` は minimum validation を通過する。
- `m == 0` の場合、任意の非ゼロ amount は minimum validation を通過する。
- 設定更新後も、更新前に作成された注文の保存値および状態は変化しない。

## Acceptance criteria

- minimum amount が非ゼロの場合、minimum 未満の pre-order をどの public entry point からも作成できない。
- minimum amount が `0` の場合、既存の amount validation を満たす注文は minimum amount によって拒否されない。
- minimum amount は currency ごとに getter で確認できる。
- owner は pre-order 期間中を含めて設定を更新でき、更新値が新規注文へ即時反映される。
- order execution path は USD 換算または oracle read を追加しない。
- 設定値と validation は currency に対応する同一 LendingMarket の storage 境界に置かれる。
- upgrade 時に active order book ごとの migration を必要としない。
- `executeOrder`、cancellation、Itayose、および既存の price range validation に regression がない。
- monitoring、alert、および off-chain automation を追加せず、contract-level mitigation として完結する。

## 残存する考慮事項

- 十分な金額と collateral coverage を持つユーザーは、多数の pre-order を作成できる。ただし、それらは経済的に裏付けられた有効な注文であり、本対応が防止対象とする低コストな dust-order griefing には該当しない。
- 有効な注文であっても、他ユーザーを排除する目的で同一価格の上限を占有すれば capacity griefing にはなり得る。ただし、その実行には注文量に比例した資金または担保、少なくとも 5,000 addresses / price / side、および transaction fee が必要になる。
- 固定された通貨単位の値は市場価格の変動により USD 換算価値が変化する。必要に応じて owner が設定値を更新する。
- 設定の有効化または増額は、すでに存在する dust pre-order を削除しない。
- 合法的な少額ユーザーの注文も minimum 未満であれば拒否される。
- `0` は設定漏れと意図的な無効化を区別しないため、deployment test と運用確認が必要になる。

これらを考慮しても、単一または少数の主要 `unitPrice` を低コストで占有できる現在のリスクに対し、network / currency ごとに設定可能な最低 pre-order 額を導入することが、今回の contract-level 対応として最も直接的である。
