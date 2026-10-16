# Lending Market Order Griefing Mitigation

## 目的

大量の `unitPrice` に少量の注文を配置し、赤黒木の価格ノード数または同一価格内の注文数を増大させる griefing 攻撃を緩和する。

特に、pre-order 期間中に作成された注文板によって `executeItayoseCall` が単一トランザクションの gas 上限を超え、マーケットを永続的に open できなくなる状態を防止する。

## 前提

- 指値注文として有効な `unitPrice` は `1..10000` とする。
- `unitPrice == 0` は通常注文の market order 指定であり、通常注文の価格範囲検証の対象外とする。pre-order では market order を受け付けず、`unitPrice == 0` を明示的に revert する。
- ユーザー当たりの注文数制限は Sybil address で回避可能であり、価格ノード数の上限としては扱わない。
- アップグレード前から範囲外注文によって注文板が汚染されている状態は、今回の対応範囲外とする。
- OrderChunk 機能は本対応のリリース前である。既存の旧形式注文は初回操作時に chunk metadata へ lazy migration されるが、現状は全 unitPrice で既存注文数が 10 件未満であり、1000 chunks の上限へ到達しないことが確認できている。このため、今回のリリースに伴う特別な migration または legacy 用上限回避処理は追加しない。
- Circuit Breaker と MarketUnitPrice の乖離により、通常注文で一度に処理される価格ノード数が 1000 を超える可能性は残る。本対応は通常注文について厳密な計算量上限ではなく、安価な dust griefing を困難にする緩和策と位置付ける。

## 定数

名称は実装時に既存の命名規則へ合わせて調整する。

| 定数                                | 値・決定方法              | 用途                                                                                                           |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `UNIT_PRICE_RANGE`                  | `1000`                    | MarketUnitPrice または opening price からの片側価格幅。min debt fallback では全幅としてこの値の 2 倍を使用する |
| `MAX_ACTIVE_CHUNKS_PER_PRICE`       | `1000`                    | 同一 unitPrice で保持できる OrderChunk 数                                                                      |
| `ORDER_CHUNK_SIZE`                  | `100`                     | 1 OrderChunk 当たりの注文数                                                                                    |
| `MAX_ITAYOSE_PRICE_LEVELS_PER_CALL` | performance test 後に決定 | 1 settlement step で処理する最大価格ノード数                                                                   |

`MAX_ACTIVE_CHUNKS_PER_PRICE = 1000` と `ORDER_CHUNK_SIZE = 100` により、同一 unitPrice では最大 100,000 注文を受け入れられる。

`MAX_ITAYOSE_PRICE_LEVELS_PER_CALL` は、最悪ケースの 1 step が 12M gas 以下になる値を performance test から決定する。

## unitPrice 検証の共通方針

- `executeOrder` と `executePreOrder` のすべての `_unitPrice != 0` に対し、関数入口で価格範囲を検証する。
- `executePreOrder` の `_unitPrice == 0` は tree library の汎用 require に依存せず、関数入口で専用の custom error により revert する。
- 注文が maker として注文板に残るかどうかによる例外は設けない。
- deposit/permit 付き関数を含むすべての入口が同じ検証を通るようにする。
- 範囲外の場合は custom error で revert する。
- 下限は最低 `1`、上限は最大 `10000` に clamp する。
- tick size は `1` のまま維持する。

### validation の実装レイヤー

価格範囲の計算には Controller storage の min debt 設定、active order book list、maturity と openingDate が必要であるため、validation と range 計算は Controller 側の共通 internal logic へ実装する。LendingMarket 側へ同じ計算を重複実装しない。

- `getOrderUnitPriceRange` と注文実行時 validation は同じ共通関数を使用する。
- `LendingMarketUserLogic.executeOrder` と `executePreOrder` では、`cleanUpFunds`、currency/maturity 登録、および LendingMarket 呼び出しより前に validation する。
- Circuit Breaker による変換後価格ではなく、ユーザーが指定した生の `_unitPrice` を validation する。
- deposit/permit 付き入口は既存どおり通常の `executeOrder` / `executePreOrder` へ合流させ、transaction 全体の revert により deposit または permit 処理も rollback する。

## 通常注文の有効範囲

### MarketUnitPrice が存在する場合

MarketUnitPrice を `marketUnitPrice` とした場合、side ごとの有効範囲を以下とする。

```text
LEND:
  min = 1
  max = min(10000, marketUnitPrice + 1000)

BORROW:
  min = max(1, marketUnitPrice - 1000)
  max = 10000
```

これにより、通常価格帯から大きく離れた価格へ 1 wei 注文を配置して、将来の約定処理で大量の価格ノードを走査させる攻撃を緩和する。

MarketUnitPrice を移動させるには reliable amount 以上の実約定が必要であり、その過程で新しい市場価格と交差する古い注文は先に約定される。このため、1 wei 注文だけで攻撃対象価格帯を移動させることはできない。

### MarketUnitPrice が 0 の場合

Itayose で約定がなかった場合など、MarketUnitPrice がまだ存在しない市場では、対象オーダーブックの `openingDate` を基準に計算した current min debt unit price を使用する。

この場合も pre-order 期間外であるため、min debt unit price を基準とする共通レンジを side 別の片側制限へ展開する。

```text
LEND:
  min = 1
  max = min(10000, currentMinDebtUnitPrice + 2000)

BORROW:
  min = currentMinDebtUnitPrice
  max = 10000
```

```text
referenceUnitPrice = max(
  1,
  getMinDebtUnitPriceAt(ccy, maturity, openingDate)
)

min = referenceUnitPrice
max = min(10000, referenceUnitPrice + 2000)

LEND:   [min, max]
BORROW: [min, max]
```

最初の reliable な MarketUnitPrice が確定した後は、MarketUnitPrice 基準の side 別範囲へ切り替える。

## pre-order の有効範囲

pre-order の範囲は、pre-order ごとの `block.timestamp` ではなく、対象オーダーブックの `openingDate` を使って決定する。これにより時間経過だけを原因とする範囲変動をなくす。

新しい range snapshot 用 storage は追加しない。このため、pre-order 期間中に `minDebtUnitPrice` が更新された場合、または直前 order book が期間途中に finalize された場合は、同じ order book でも参照価格と有効範囲が変わり得る。以下を運用上の前提とする。

- `minDebtUnitPrice` は対象通貨に pre-order 期間中の order book が存在する間は更新しない。
- 直前 order book の Itayose は、次の order book の pre-order 開始前に finalize する。

この運用前提に違反した場合、有効価格ノード数が 2001 を超え、`calculateItayoseResult` の gas 見積もりが通常の上限を超える可能性がある。settlement 自体は batch 化されるが、その前段の `calculateItayoseResult` は一括実行であるため、運用ルール違反時の復旧を保証しない。

performance test では通常の 2001 ノードに加えて、期間途中に参照 range が 1 回切り替わったケースと、unitPrice の絶対範囲 `1..10000` に広がったケースの `calculateItayoseResult` gas を計測し、運用ルール違反時の実際の余裕を把握する。

### 直前の opening price が存在する場合

対象通貨について、対象オーダーブックより直前の満期を持つオーダーブックを参照する。

直前 order book は、Controller の active `orderBookIdLists[ccy]` から対象 maturity の index を検索し、その 1 つ前の要素として取得する。対象が list の先頭、list に存在しない、または直前要素が存在しない場合は min debt 基準へ fallback する。rotation 済みで active list から除去された過去 order book は参照対象にしない。注文 validation と UI 向け getter は同じ探索関数を使用する。

以下をすべて満たす場合、その opening price を使用する。

- 直前オーダーブックの Itayose が finalize 済み
- `openingUnitPrice != 0`

直前オーダーブックと新しいオーダーブックで残存期間が異なるため、同じ単利年率になるよう unitPrice を変換する。

```text
sourceDuration      = previousMaturity - previousOpeningDate
destinationDuration = maturity - openingDate

convertedUnitPrice =
  10000 * previousOpeningUnitPrice * sourceDuration
  /
  (
    (10000 - previousOpeningUnitPrice) * destinationDuration
    + previousOpeningUnitPrice * sourceDuration
  )
```

変換後の unitPrice を中心に上下 1000 を有効範囲とする。

```text
min = max(1, convertedUnitPrice - 1000)
max = min(10000, convertedUnitPrice + 1000)

LEND:   [min, max]
BORROW: [min, max]
```

### 直前の opening price を使用できない場合

以下の場合は min debt unit price 基準へ fallback する。

- 直前のオーダーブックが存在しない
- 直前の Itayose が未 finalize
- 直前の `openingUnitPrice == 0`

通常注文の「MarketUnitPrice が 0 の場合」と同じ openingDate 基準の min debt unit price から、共通の fallback range を計算する。ただし pre-order 期間中は side 別の片側制限へ展開せず、LEND/BORROW の両方を `[currentMinDebtUnitPrice, min(10000, currentMinDebtUnitPrice + 2000)]` に制限する。

## min debt unit price の基準日時指定

現在の `getCurrentMinDebtUnitPrice` は `block.timestamp` を使用する。openingDate 基準の価格範囲計算では、任意の基準日時を指定できる共通計算関数を追加する。

概念上の計算は以下とする。

```solidity
function calculateMinDebtUnitPriceAt(
  uint256 maturity,
  uint256 minDebtUnitPrice,
  uint256 referenceTimestamp
) internal pure returns (uint256) {
  if (minDebtUnitPrice == 0) return 0;
  if (minDebtUnitPrice >= BASE_MIN_DEBT_UNIT_PRICE) {
    return BASE_MIN_DEBT_UNIT_PRICE;
  }

  if (maturity <= referenceTimestamp) return BASE_MIN_DEBT_UNIT_PRICE;

  uint256 reduction = ((BASE_MIN_DEBT_UNIT_PRICE - minDebtUnitPrice) *
    (maturity - referenceTimestamp)) / Constants.SECONDS_IN_YEAR;

  return
    reduction >= BASE_MIN_DEBT_UNIT_PRICE
      ? 1
      : BASE_MIN_DEBT_UNIT_PRICE - reduction;
}
```

既存 external ABI の overload によるクライアントへの影響を避けるため、外部公開が必要な場合は別名の `getMinDebtUnitPriceAt` を使用する。既存の `getCurrentMinDebtUnitPrice` はこの共通関数へ `block.timestamp` を渡す。

`LendingMarketOperationLogic` はデータとして有効な unit price であることに責務を持つため、`updateMinDebtUnitPrice` は `PRICE_DIGIT` を上限とする。`FundManagementLogic` は資産計算に責務を持ち、`minDebtUnitPrice >= BASE_MIN_DEBT_UNIT_PRICE` の場合は `BASE_MIN_DEBT_UNIT_PRICE` へ clamp して減算の underflow を防ぐ。`minDebtUnitPrice == 0` は既存どおり無効値指定として許可し、計算結果 0 を返す。

order book の残存期間にシステム上の上限は追加しない。長期満期で reduction が `BASE_MIN_DEBT_UNIT_PRICE` 以上になる場合は、有効 unitPrice の下限である 1 へ clamp する。現行最大の 2 年とビジネス上想定される長期ケースの 10 年について、`minDebtUnitPrice == 0`、1、現在の設定値、`BASE_MIN_DEBT_UNIT_PRICE` の境界をテストする。

## UI 向け有効価格範囲 getter

UI が現在の有効価格範囲と、その基準を判定できる getter を `LendingMarketController` に追加する。

名称は以下を基本とする。

```solidity
function getOrderUnitPriceRange(
  bytes32 ccy,
  uint256 maturity
)
  external
  view
  returns (
    uint256 minLendUnitPrice,
    uint256 maxLendUnitPrice,
    uint256 minBorrowUnitPrice,
    uint256 maxBorrowUnitPrice,
    uint256 referenceUnitPrice,
    bool isMinDebtUnitPriceReference
  );
```

既存の低レイヤー getter と同様に、返却値は named tuple とする。`isMinDebtUnitPriceReference` は、価格範囲が fallback として min debt unit price を基準にしているかを示す。pre-order 期間かどうかは unit price range 自体の情報ではないため返却値に含めず、必要な利用者は `LendingMarket.isPreOrderPeriod` から取得する。`InvalidCurrency`、`InvalidOrderUnitPrice`、`IncompleteItayoseProcess` は `LendingMarketOperationLogic` に定義し、同 Logic から `ILendingMarketController` への直接依存を持たせない。

返却内容は pre-order 期間か、それ以外かに応じて変化する。

| 状態                                 | `isMinDebtUnitPriceReference` | 基準値                     | 範囲                                            |
| ------------------------------------ | ----------------------------- | -------------------------- | ----------------------------------------------- |
| pre-order、直前 opening あり         | `false`                       | 期間変換後の opening price | 基準値 ±1000                                    |
| pre-order、fallback                  | `true`                        | openingDate 基準 min debt  | 基準値から+2000                                 |
| pre-order 以外、MarketUnitPrice あり | `false`                       | MarketUnitPrice            | side 別の片側 1000 制限                         |
| pre-order 以外、MarketUnitPrice なし | `true`                        | openingDate 基準 min debt  | min debt の共通レンジを side 別の片側制限へ展開 |

この getter と注文実行時の validation は、同じ internal 計算関数を使用し、UI 表示と on-chain 判定の乖離を防止する。

private の基準レンジ計算は `minUnitPrice`、`maxUnitPrice`、`referenceUnitPrice`、`isPreOrderPeriod`、`isMinDebtUnitPriceReference` を返す。公開 getter はその結果を side 別レンジへ展開し、pre-order 期間中は両 side に同じ `min/max` を使用する。pre-order 期間外は `minLendUnitPrice = 1`、`maxBorrowUnitPrice = PRICE_DIGIT` とする。`isPreOrderPeriod` はこの内部展開にのみ使用し、公開 getter の返却値には含めない。

pre-order 期間以外は、Itayose 中、open 前、満期後を含めて通常注文と同じ規則で参考範囲を返す。返却された範囲は、その時点で注文実行可能であることを保証しない。注文可否は既存の `isPreOrderPeriod`、`isOpened`、`isMatured` を使用して判定する。

## Itayose の batch 化

### 対象

- `OrderBookLib.calculateItayoseResult` は一括実行する。
- `fillOrders`による LEND/BORROW 注文の settlement を価格ノード単位で分割する。
- 同一価格の OrderChunk 単位 batch 化は原則行わない。

運用前提どおり同じ pre-order range が維持された場合、有効 unitPrice 幅が最大 2000 であるため、`calculateItayoseResult` の最大反復数は両端 inclusive の場合で概ね 2001 となる。各ループで LEND カーソル、BORROW カーソル、またはその両方が必ず内側へ移動するため、LEND/BORROW ツリーのノード数の合計までは増加しない。

最終的な採用条件として、最悪の amount 分布で `calculateItayoseResult` 単体の gas を performance test により確認する。

### 状態

`LendingMarketStorage.Storage` の末尾に、maturity 単位の process mapping を追加する。

```solidity
struct ItayoseProcess {
    bool isInProgress;
    uint256 totalOffsetAmount;
    uint256 remainingLendOffsetAmount;
    uint256 remainingBorrowOffsetAmount;
}

mapping(uint256 maturity => ItayoseProcess process) itayoseProcesses;
```

Itayose の完了判定には既存の `isReady` を使用する。process には `NONE` / `FINALIZED` に相当する状態を重複して保存せず、未完了 process が存在する期間だけ `isInProgress == true` とする。これにより、アップグレード前から存在する ready 済み order book と、Itayose 不要で作成時から ready になる order book はいずれも追加 migration なしで `isInProgress == false && isReady == true` となる。

状態の解釈は以下とする。

| `isInProgress` | `isReady` | remaining amounts | 状態                                                  |
| -------------- | --------- | ----------------- | ----------------------------------------------------- |
| false          | false     | 0                 | Itayose 未開始                                        |
| true           | false     | いずれかが 1 以上 | settlement 中                                         |
| true           | false     | 両方 0            | finalize 可能                                         |
| false          | true      | 0                 | finalize 済み、legacy ready 済み、または Itayose 不要 |

finalize 可能になっても、finalize transaction が完了するまでは `isInProgress` を false に戻さない。`itayoseLogs` は約定量 0 の場合に全項目が 0 となり未保存状態と区別できないため、`isInProgress == false && itayoseLogs保存済み` を finalize 可能判定には使用しない。

opening price、last LEND/BORROW prices は先行保存する `itayoseLogs` を正本とし、`ItayoseProcess` には重複保存しない。

以下を process invariant とする。実装済みの分岐や既存 modifier と重複せず、追加 gas が軽微なものは custom error または assert で検証する。冗長になるものは明示的な runtime check を追加せず、unit test と invariant test で保証する。

```text
isReady => !isInProgress
isInProgress => !isReady
remainingLendOffsetAmount <= totalOffsetAmount
remainingBorrowOffsetAmount <= totalOffsetAmount
remainingLendOffsetAmount < totalOffsetAmount => remainingBorrowOffsetAmount == 0
```

### 初期化

最初の step では `isInProgress == false && isReady == false` を確認した上で `calculateItayoseResult` を一度だけ実行し、offset amounts を `ItayoseProcess` に保存する。

```text
isInProgress = true
totalOffsetAmount = calculatedTotalOffsetAmount
remainingLendOffsetAmount = calculatedTotalOffsetAmount
remainingBorrowOffsetAmount = calculatedTotalOffsetAmount
```

`totalOffsetAmount == 0` の場合は、両方の remaining amount が 0 のまま `isInProgress == true` となり、次の step で finalize する。

`totalOffsetAmount > 0` の場合、最初の settlement より前に `setInitialBlockUnitPrice(openingUnitPrice)` を実行する。settlement 途中にユーザーが cleanup や funds 計算を実行した場合でも、opening price を使用して評価できるようにする。

計算結果が確定した時点で、以下の 3 項目を `itayoseLogs` に保存する。

- `openingUnitPrice`
- `lastLendUnitPrice`
- `lastBorrowUnitPrice`

settlement 途中の pre-order を cleanup または getter で評価する際にも、約定対象の注文を opening price で FV 換算する必要があるためである。`openingUnitPrice` だけを保存すると、既存の `_getOrderUnitPrice` が last prices も約定対象判定に使用しているため不十分となる。

process 初期化後に計算結果を変更または再計算しないため、`itayoseLogs` の先行保存によって追加の effective log 判定は設けない。

初期化 step では process 初期化、`itayoseLogs` の保存、initial MarketUnitPrice の設定までを同一 transaction 内で atomic に実行し、settlement は次の step から開始する。これにより、`calculateItayoseResult` と最大 settlement batch の gas が同じ transaction へ重ならないようにする。初期化処理が revert した場合は log 保存を含む初期化全体を revert する。

process 初期化後は以下を禁止する。

- process の再初期化
- `calculateItayoseResult` の再実行
- `itayoseLogs` の上書きまたは変更
- process の abort または reset

`itayoseLogs` が保存済みであることは market の open または Itayose の finalize 完了を意味しない。finalize 済みかどうかは既存の `isReady` で判定する。

先行保存後は、既存の `OrderReaderLogic._getOrderUnitPrice` がそのまま以下の全経路へ opening price を適用する。

- `getOrder`
- `getLendOrderAmounts` / `getBorrowOrderAmounts`
- `getTotalAmountFromLendOrders` / `getTotalAmountFromBorrowOrders`
- `cleanUpOrders`
- `FundManagementLogic.getActualFunds` を経由する position、coverage、collateral 計算

前回 opening price を新しい pre-order 範囲の基準に使用する処理は、`itayoseLogs.openingUnitPrice != 0` だけで判定してはならない。先行保存された未 finalize の log を参照しないよう、前回 order book の `isReady == true` も必須条件とする。

`isReady` は finalize まで更新しない。

### settlement step

1 step では、現在の best price から最大 `MAX_ITAYOSE_PRICE_LEVELS_PER_CALL` 価格ノードを処理する。

- caller が任意の offset amount を指定する方式にはしない。
- caller に LEND/BORROW のどちらを処理するか指定させない。
- 中間 step は価格ノード境界で終了させる。
- `remainingOffsetAmount` が現在価格ノードの amount 未満になる最終価格ノードだけ部分約定する。
- 同じ価格ノードを複数 step で部分約定しない。
- これにより、FV の丸め結果を従来の一括処理と一致させ、各 side の `partiallyFilledOrder` を最大 1 件にする。

処理 side は remaining amounts から内部で一意に決定する。現行一括処理の内部順序と同じく、BORROW maker 側を先に settle する。

```text
remainingBorrowOffsetAmount > 0:
  maker side = BORROW
  fillOrders side argument = LEND
  target tree = borrowOrders
  traversal = best priceからdropLeft方向

remainingBorrowOffsetAmount == 0 && remainingLendOffsetAmount > 0:
  maker side = LEND
  fillOrders side argument = BORROW
  target tree = lendOrders
  traversal = best priceからdropRight方向

both remaining amounts == 0:
  finalize
```

`fillOrders` の side 引数は maker side ではなく taker side であるため、上記の対応を実装コメントにも明記する。

batch 境界は以下の手順で決定する。

1. 対象 tree の best price から最大 `MAX_ITAYOSE_PRICE_LEVELS_PER_CALL` ノードを走査し、当該 step の boundary unit price を取得する。
2. side の `remainingOffsetAmount` と boundary unit price を既存の `fillOrders` に渡す。
3. 実際に返された `filledOrder.amount` を `batchFilledAmount` とする。
4. `remainingOffsetAmount` から `batchFilledAmount` を減算する。

`remainingOffsetAmount > 0` なのに `batchFilledAmount == 0` の場合は、進捗のない process が残ることを防ぐため custom error で revert する。また、当該 side の処理後も `remainingOffsetAmount > 0` である中間 batch では、`partiallyFilledOrder` の全項目が 0 であることを検証し、非ゼロの場合は revert する。partial order を許可するのは、当該 side の remaining amount が 0 になる最終ノードだけとする。

各 step で約定した結果は、同一 Controller transaction 内で会計へ反映する。

```text
pendingOrderAmounts += batchFilledAmount - partiallyFilledOrder.amount
```

ここで `batchFilledAmount` は、その side の当該 step で処理した full order と partial order の PV 合計とする。partial order は同じ transaction 内で maker funds へ直接反映されるため、lazy cleanup 対象となる full order の PV だけが最終的に `pendingOrderAmounts` へ残る。

`partiallyFilledOrder.futureValue != 0` の場合は、同じ step 内で `FundManagementLogic.updateFundsForMaker` を実行する。maker/taker の資産更新ヘルパーはともに `FundManagementLogic` に配置し、観測期間の order log 更新は `LendingMarketOperationLogic` の責務として分離する。

settlement による tree 更新、`pendingOrderAmounts` の加算、partial maker funds の更新、および remaining amount の更新は、すべて同じ Controller transaction 内で atomic に完了させる。途中でいずれかが revert した場合は step 全体を revert する。

`partiallyFilledOrder` の配列は storage へ保存しない。full order は従来通り lazy cleanup の対象とする。

BORROW 側の remaining amount が 0 になった次の step から LEND 側を処理する。LEND 側も 0 になった時点では `isInProgress == true` を維持し、次の step で finalize する。

### finalize

`isInProgress == true` かつ LEND/BORROW 両方の remaining amount が 0 の場合のみ finalize できる。

finalize では以下を行う。

- `isReady = true`
- process 初期化時に保存した `itayoseLogs` を書き換えない
- 既存挙動と同じく `totalOffsetAmount > 0` の場合のみ `ItayoseExecuted` emit
- 最初の nearest market で opening price が非ゼロの場合、initial compound factor を更新
- `isInProgress = false`

finalize では注文処理または可変長配列のループを行わず、gas を固定する。

二重 finalize は revert し、`ItayoseExecuted` を二重 emit しない。

LendingMarket で行う `isReady` / process 更新と、Controller で行う initial compound factor 更新および lifecycle event emit は、同じ Controller transaction 内で atomic に完了させる。initial compound factor 更新を含む後続処理が revert した場合、LendingMarket 側の finalize、`ItayoseExecuted`、`ItayoseProcessFinalized` もすべて rollback する。

## Itayose API

### LendingMarket と Controller 間の phase API

storage 上の状態は `isInProgress` と remaining amounts だけで管理する。LendingMarket では phase 判定と各 phase の実処理を 1 つの関数へ混在させず、以下の 3 つの Controller 専用 API へ分離する。

```solidity
function initializeItayose(
  uint8 orderBookId
) external onlyLendingMarketController returns (ItayoseProcessStatus memory);

function executeItayoseSettlement(
  uint8 orderBookId
) external onlyLendingMarketController returns (ItayoseSettlementResult memory);

function finalizeItayose(
  uint8 orderBookId
) external onlyLendingMarketController returns (ItayoseFinalizeResult memory);
```

settlement と finalize の返却値は以下を基本とする。これらの返却値型と `ItayoseProcessStatus` は storage へ保存されず `OrderBookLogic` が生成責務を持つため、`OrderBookLogic.sol` の library 外に top-level 型として定義する。Itayose process 固有の custom error も `OrderBookLogic` 内に定義し、`OrderBookLogic` から `ILendingMarket` への依存を持たせない。`LendingMarketStorage` には保存対象の `ItayoseProcess` と `ItayoseLog` だけを定義する。

```solidity
struct ItayoseSettlementResult {
  ProtocolTypes.Side makerSide;
  uint256 batchFilledAmount;
  uint256 remainingLendOffsetAmount;
  uint256 remainingBorrowOffsetAmount;
  PartiallyFilledOrder partiallyFilledOrder;
}

struct ItayoseFinalizeResult {
  uint256 openingUnitPrice;
  uint256 totalOffsetAmount;
  uint256 openingDate;
}
```

各 API の責務と Controller の後処理は以下とする。

| API                        | LendingMarket で完了する処理                                              | Controller の後処理                                    |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `initializeItayose`        | result 計算、process/log 保存、initial MarketUnitPrice 設定               | `ItayoseProcessInitialized` emit                       |
| `executeItayoseSettlement` | 次に処理すべき maker side の tree と remaining 更新                       | pending amount 加算、partial maker 更新、progress emit |
| `finalizeItayose`          | `isReady = true`、`isInProgress = false`、必要なら `ItayoseExecuted` emit | initial compound factor 更新、finalized event emit     |

settlement side は LendingMarket が remaining amounts から決定し、caller には指定させない。Controller の分割実行 API だけが process status に応じて上記 3 API のいずれか 1 つを呼び出す。

LendingMarket の旧 `executeItayoseCall(uint8)` は削除する。一括実行は LendingMarketController だけが提供する。旧 Controller との ABI 互換性は維持しないため、LendingMarket implementation と LendingMarketController implementation は同一 Safe transaction 内で atomic に upgrade する。FVM では個別 proposal 間に一時的な API 不整合が生じ得ることを許容する。

### 分割実行

大規模 order book の復旧および分割実行向けに、現在状態の 1 step だけを実行する関数を追加する。

```solidity
function executeItayoseStep(
  bytes32 ccy,
  uint256 maturity
) external returns (bool completed);
```

- `false`: process が進行したが未 finalize
- `true`: この step で finalize まで完了
- permissionless に呼び出せる
- Controller の `nonReentrant` と `ifActive` を適用する

分割実行を使用する運用 task は `isReady == true` になるまで `executeItayoseStep` を繰り返す。

### process・進捗 getter

UI、Indexer、運用 task および lifecycle 処理が、`isReady == false` の内訳を判別できる getter を追加する。

概念上の返却値は以下とする。

```solidity
struct ItayoseProcessStatus {
  uint256 openingUnitPrice;
  uint256 lastLendUnitPrice;
  uint256 lastBorrowUnitPrice;
  uint256 totalOffsetAmount;
  uint256 remainingLendOffsetAmount;
  uint256 remainingBorrowOffsetAmount;
  bool isInProgress;
  bool isFinalizable;
  bool isReady;
}
```

opening price と last prices は `itayoseLogs` から返し、process storage との二重管理は行わない。`isFinalizable` は storage へ保存せず、`isInProgress && remainingLendOffsetAmount == 0 && remainingBorrowOffsetAmount == 0` から getter 内で導出する。

getter は少なくとも currency と maturity を指定して取得できるようにする。運用 task は return 値の `completed` だけに依存せず、transaction ごとに `isInProgress`、`isReady`、remaining amounts を再取得して再開可能にする。

### process event

Indexer と分割実行 task が進捗を追跡できるよう、少なくとも以下の event を追加する。名称と型は実装時の既存規則に合わせる。

```solidity
event ItayoseProcessInitialized(
    bytes32 indexed ccy,
    uint256 indexed maturity,
    uint256 openingUnitPrice,
    uint256 lastLendUnitPrice,
    uint256 lastBorrowUnitPrice,
    uint256 totalOffsetAmount
);

event ItayoseSettlementProgress(
    bytes32 indexed ccy,
    uint256 indexed maturity,
    ProtocolTypes.Side makerSide,
    uint256 batchFilledAmount,
    uint256 remainingLendOffsetAmount,
    uint256 remainingBorrowOffsetAmount
);

event ItayoseProcessFinalized(bytes32 indexed ccy, uint256 indexed maturity);
```

新しい process lifecycle event はすべて LendingMarketController proxy address から emit する。初期化 event は process と log の保存後に 1 回だけ emit する。progress event は各 settlement step の Controller 会計更新後に emit する。finalize event は LendingMarket の state 更新と Controller の initial compound factor 更新後に、offset の有無にかかわらず 1 回だけ emit する。

finalize 完了判定の on-chain state における正本は `isReady` のままとする。既存の `ItayoseExecuted` は `totalOffsetAmount > 0` の場合だけ emit する挙動を維持し、新しい `ItayoseProcessFinalized` を process lifecycle 用 event として使用する。

### 既存一括実行

既存の `LendingMarketController.executeItayoseCall` は ABI 互換のため残す。

内部では旧一括ロジックを使用せず、未初期化の場合だけ `initializeItayose` を呼び、`executeItayoseSettlement` だけを remaining amounts が 0 になるまで繰り返し、最後に `finalizeItayose` を 1 回呼ぶ。分割実行途中から呼ばれた場合は再初期化せず、残りの settlement から再開する。

```solidity
function executeItayoseCall(
  bytes32 ccy,
  uint256 maturity
) external returns (bool) {
  if (!status.isInProgress) initializeItayose(ccy, maturity);
  while (remainingBorrowOffsetAmount > 0 || remainingLendOffsetAmount > 0) {
    executeItayoseSettlement(ccy, maturity);
  }
  finalizeItayose(ccy, maturity);
  return true;
}
```

この関数は通常規模の注文板、通常運用、後方互換性、既存テストに使用する。大規模注文板では transaction gas cap を超える可能性があるため、その場合だけ分割 API へ切り替える。

### automation

automation ごとに以下の実行方式を使用する。

- Gelato resolver は 1transaction 内で処理を完了する必要があるため、既存どおり一括 `executeItayoseCall` を payload に使用する。
- `isItayosePeriod` は finalize まで true であるため、resolver の実行可否判定には引き続き使用できる。
- `tasks/open-markets.ts` は UX と通常ケースの transaction 数を優先し、既存どおり一括 `executeItayoseCall` を使用する。
- 一括実行が transaction gas cap を超える極端な order book だけ、追加する Hardhat task `tasks/settle-itayose.ts` から `executeItayoseStep` を繰り返す。
- `settle-itayose` task は currency と maturity を必須引数とし、transaction ごとに process status を再取得して途中状態から再開できるようにする。`isReady == true` になった時点で成功終了し、期限未到来、無効 maturity、pause 中など進行不能な状態は明示的な error として終了する。
- Gelato の一括 transaction が同時に送信されても state 不整合は起きず、成功すれば残りをまとめて finalize し、OOG なら state 変更なしで revert する。極端な order book では必要に応じて Gelato task を一時停止した上で復旧 task を実行する運用手順を用意する。

## Itayose estimation

- `isInProgress == false` の場合は従来通り注文板から estimation を計算する。finalize 後の直接呼び出しも既存挙動を維持する。
- `isInProgress == true` の間は先行保存済みの `itayoseLogs` と process の `totalOffsetAmount` を返す。
- settlement 途中の変更済み注文板から Itayose 結果を再計算しない。
- UI/Reader が process 状態と進捗を取得できる getter を追加する。

`LendingMarketReader.getOrderBookDetail` 自体は変更しない。既存 Reader は `isReady == false` の間、`getItayoseEstimation` から取得した `openingUnitPrice` だけを使用する。このため、LendingMarket 側の `getItayoseEstimation` を修正し、`isInProgress == true` の間は保存済みの opening price、last prices、total offset amount を返すことで、既存 Reader が取得する opening price を固定する。`isReady == true` の Reader は既存どおり `getItayoseLog` を使用する。

process 進捗を `LendingMarketReader.OrderBookDetail` へ追加する変更は、opening price を正しく返すためには不要とする。UI、Indexer、運用 task が進捗を必要とする場合は、別途追加する process status getter を使用する。

## settlement 途中の cleanup と getter

- `cleanUpFunds` は settlement 途中でも許可する。
- process 初期化時に `itayoseLogs` の 3 項目を先行保存することで、inactive になった pre-order の FV は finalize 前でも opening price を使用して計算する。
- `pendingOrderAmounts` は各 settlement step と同じ Controller transaction 内で加算する。finalize で一括加算しない。
- partial maker の funds 更新も同じ step 内で行う。
- `getPosition`、`calculateFunds`、coverage、ZC Token 関連 getter は、settlement 済み batch を finalize 前から position として返す。この状態は確定済み settlement として扱う。

TokenVault の deposit/withdraw、ZC Token の deposit/withdraw、liquidation などは内部で `cleanUpFunds` または `getActualFunds` を使用するため、明示的な cleanup だけを対策しても不十分である。これらの経路を settlement 中に一律禁止せず、先行保存した完全な Itayose log と step 単位の pending accounting によって正しく動作させる。

現行一括処理と同じく、BORROW maker settlement が完了してから LEND maker settlement へ進む。BORROW だけが settlement 済みの期間は、未処理の LEND 注文が active な working lend order として残る。この途中状態でも、settlement 済み BORROW position、未処理 LEND working order、deposit balance、coverage が一括 Itayose 後の結果と整合することを検証する。

cleanup は以下を満たす必要がある。

- 同一ユーザーが各 settlement step 後に cleanup しても FV と deposit balance が一括 Itayose と一致する。
- cleanup 済み full order の PV だけ `pendingOrderAmounts` から減算される。
- 同じユーザーが複数回 cleanup しても二重反映または underflow しない。
- finalize では cleanup 済み・未 cleanup の注文に対する追加会計処理を行わない。

### Getter ごとの途中状態

- `getItayoseLog`: process 初期化直後から確定済み価格結果を返す。ただし finalize 完了を意味しない。
- `getItayoseEstimation`: `isInProgress == true` の間は保存済み結果を返し、変更途中の tree から再計算しない。finalize 後の直接呼び出しは既存どおり tree から計算する。
- `getMarketUnitPrice`: offset が存在する場合は最初の settlement より前から opening price を返し得る。
- `isReady` / `isOpened`: finalize まで false を維持する。market open 判定の正本とする。
- `getOrder` / `getOrders`: tree から処理済みになった注文は batch 単位で inactive へ移動する。対象 pre-order の unit price は opening price を返す。
- `getPosition` / `getActualFunds`: 処理済み batch の position を finalize 前から含める。未処理注文は working order として残す。
- order book depth / best prices: settlement により片側ずつ変化する途中スナップショットを返す。
- `getPendingOrderAmount`: settlement と cleanup の進行に応じて増減し、finalize 時に一括で確定する値ではない。

`getItayoseLog` の ABI は変更しないが、interface と実装の NatSpec および外部 API ドキュメントは「Itayose 実行済み log」ではなく「不可逆に確定した価格発見結果であり、未 finalize でも返り得る」と更新する。finalize 完了の確認には `isReady` を使用する。

### UI・Indexer の扱い

- `itayoseLogs.openingUnitPrice != 0` または `marketUnitPrice != 0` だけで market open と判定せず、`isReady` を使用する。
- `isInProgress == true` の間は注文入力と通常の order book 表示を無効にする。現在の settlement side と finalize 可能状態は remaining amounts から判定する。
- inactive になった pre-order は通常の open 済み市場における約定と区別し、「settled / pending open」相当の状態で表示する。
- position はユーザー操作がなくても settlement step ごとに増減し得るため、process 進捗と同時に再取得する。
- settlement 途中の order book depth と best prices は価格発見結果として表示しない。
- `OrdersCleaned` および `OrdersFilledInAsync` は `ItayoseExecuted` より前に emit され得る。Indexer はイベント順だけから market open を推測しない。
- `isReady == true` を finalize 完了の正本として扱う。`ItayoseExecuted` は `totalOffsetAmount > 0` の process でのみ emit される既存 event として扱う。
- Indexer は Controller から emit される `ItayoseProcessInitialized`、`ItayoseSettlementProgress`、`ItayoseProcessFinalized` を process lifecycle として使用できる。再同期時は event だけに依存せず process status と `isReady` を正本とする。

## lifecycle 処理との競合

### Order book rotation

rotation 対象または auto-roll destination の order book に未完了または期限到来済み未開始の Itayose が存在する場合、`rotateOrderBooks` は revert する。

block 条件は以下とする。

```text
isInProgress || (!isReady && isItayosePeriod)
```

`isInProgress == true` は初期化済みで未 finalize の process を表す。`!isReady && isItayosePeriod` は期限到来済みだが初期化 transaction がまだ成功していない Itayose を表す。permissionless な step で process を finalize した後に rotation を再実行する。

legacy ready 済みまたは Itayose 不要の order book は `isReady == true && isInProgress == false` であるため、追加 migration なしで rotation 可能とする。pre-order 開始前または Itayose 期間前の将来 order book は `isItayosePeriod == false` であり、この条件だけでは rotation を block しない。

未完了チェックは order book list の変更や auto-roll 処理より前に実行する。これにより、process 途中の order book が active list から外れたり、settlement 途中の FV が auto-roll されることを防止する。

### Emergency termination

emergency termination は、active order book に `isInProgress == true` の Itayose が存在しない場合のみ実行できる。settlement 途中または settlement 完了後かつ finalize 前の process が存在する場合は、部分的に更新された資金・注文状態を termination に持ち込まないため custom error で revert する。

期限到来済みでも未開始の Itayose、すなわち `isInProgress == false && isReady == false && isItayosePeriod == true` は emergency termination を block しない。初期化前であれば Itayose による約定や資金更新はまだ発生しておらず、その pre-order は約定しないまま termination 後に実行不能となる。未知の不具合により Itayose 自体を開始できない場合でも termination を妨げないことを優先する。

rotation では未開始の Itayose も含めて完了を要求する一方、termination では各 currency の active order book list を走査し、process status getter の `isInProgress` だけを block 条件として確認する。

運用手順は以下とする。

1. 必要に応じて LendingMarket と TokenVault を pause し、ユーザー操作を停止する。
2. termination 準備時に `isInProgress == true` の process を列挙する。
3. pause 中は現行の `whenNotPaused` により Itayose settlement および TokenVault 残高更新を完了できないため、必要なコントラクトを制御下で unpause する。
4. 開始済みのすべての process を finalize する。期限到来済みでも未開始の Itayose を新たに開始する必要はない。
5. `isInProgress == true` の process がないことをコントラクトで検証して emergency termination を実行する。

emergency termination は即時の攻撃対応手段とは位置付けず、時間にセンシティブな対応には pause を使用する。

## Gas 要件

Ethereum では block gas limit とは別に、単一 transaction の gas cap を考慮する必要がある。対象チェーンごとに実際の per-transaction gas cap を確認する。

Ethereum の 16,777,216 gas cap を基準にする場合、各 step は 12M gas 以下を目標とする。

performance test では最低限、以下を個別および複合して計測する。

- 運用前提内の最大 2001 価格ノードを走査する `calculateItayoseResult`
- pre-order 期間途中に参照 range が 1 回切り替わった複数 range の `calculateItayoseResult`
- unitPrice `1..10000` の絶対最大範囲を走査する `calculateItayoseResult`
- 1 settlement step の最大価格ノード数
- 最終部分約定価格に 1000 active chunks
- LEND/BORROW 双方の worst-case
- Controller の pending amount 更新と partial maker 更新
- finalize
- 既存一括 wrapper の通常ケース

1000 chunks を含む最終価格ノードの step が gas 目標を超える場合に限り、OrderChunk 単位の batch 化を追加設計する。

## テスト方針

### 既存テスト

既存の `LendingMarketController.executeItayoseCall` テストはすべて残し、initialize、settlement loop、finalize を順に呼ぶ Controller の一括実行に対して実行する。LendingMarket 単体の旧 `executeItayoseCall(uint8)` テストは、3 つの phase API を順に呼ぶテストへ変更する。

これにより、以下の既存挙動との互換性を確認する。

- opening price
- total offset amount
- last LEND/BORROW prices
- 最終注文板
- user funds と FutureValueVault
- pending order amount
- Itayose log
- initial compound factor
- events

### 分割実行テスト

既存テストに加えて、以下を追加する。

- BORROW settlement 途中の状態
- LEND settlement 途中の状態
- 別 transaction および別 caller からの再開
- process 初期化 step では注文 tree を変更せず、`itayoseLogs` の 3 項目が保存され、`isInProgress == true`、`isReady == false` となること
- legacy、Itayose 不要、未開始、settlement 中、finalize 可能、finalize 済みの各組み合わせで `isInProgress` と `isReady` の解釈が正しいこと
- process 初期化後も `isItayosePeriod == true` であり、`isOpened == false` であること
- process 初期化時には `ItayoseProcessInitialized` だけが emit され、`ItayoseExecuted` が emit されないこと
- process 初期化 transaction の後続処理が revert した場合、process と `itayoseLogs` の保存も revert すること
- process を再初期化できず、保存済み log を上書きできないこと
- `openingUnitPrice` だけでなく last LEND/BORROW prices を使って約定対象 pre-order だけが opening price で評価されること
- settlement 前の active な対象 pre-order も opening price で返され、非対象 pre-order は元の limit price を維持すること
- 未 finalize の先行保存 log が次の order book の pre-order 価格範囲に使用されないこと
- BORROW settlement 途中、LEND settlement 途中、両 remaining amount が 0 の finalize 可能状態での `cleanUpFunds`
- TokenVault の deposit/withdraw から暗黙に cleanup されるケース
- ZC Token の withdrawable amount と deposit/withdraw を settlement 途中に実行するケース
- settlement 途中の `getPosition`、`getActualFunds`、`calculateFunds`、coverage および collateral 計算
- 初期化直後の active BORROW 注文について、opening price を使った working order amount と coverage が最終的な約定後会計と整合すること
- BORROW settlement 完了後に残る active LEND 注文の working order amount、deposit balance、coverage が一括 Itayose 後の会計と整合すること
- settlement 途中での liquidation 可否が一括 Itayose 後の会計結果と整合すること
- 各 step 直後に cleanup した場合と finalize 後に一括 cleanup した場合で、deposit balance、FV、pending amount が一致すること
- 同一ユーザーによる複数回 cleanup で二重反映または pending amount の underflow が起きないこと
- batch size にかかわらず一括実行と最終状態が一致
- 分割 settlement 途中から Controller の一括 `executeItayoseCall` を呼んだ場合、再初期化せず残りを処理して finalize すること
- LEND maker settlement では `fillOrders(BORROW, ...)`、BORROW maker settlement では `fillOrders(LEND, ...)` が使用されること
- caller が settlement side を指定できず、BORROW remaining が 0 になる前に LEND tree が変更されないこと
- LendingMarket の initialize、settlement、finalize API が他 phase の処理を暗黙に実行せず、各 API の事前条件を満たさない呼び出しが revert すること
- LendingMarket の settlement result が maker side を返し、Controller がその side に対応する会計だけを実行すること
- 中間 batch では `partiallyFilledOrder` が 0 であり、最終価格ノードだけ partial を許可すること
- remaining amount が非ゼロのまま `batchFilledAmount == 0` になった場合に revert すること
- 最終価格ノードでの部分約定
- 最終価格ノードに 1000 chunks が存在するケース
- `totalOffsetAmount == 0`
- LEND/BORROW の片側だけに多数ノードがあるケース
- 1 ループで片側カーソルだけが進む `calculateItayoseResult` の最大反復ケース
- 二重初期化、不正な process 状態での settlement、二重 finalize の revert
- process invariant を各 step 後に満たし、runtime check を実装した項目では不正状態が custom error または assert で停止すること
- process 途中で estimation が保存済み結果から変化しないこと
- finalize 後に直接 `getItayoseEstimation` を呼んだ場合は既存どおり tree から計算し、Reader は `getItayoseLog` を使用すること
- `isInProgress`、`isFinalizable`、`isReady`、remaining amounts getter が各 step の状態と一致すること
- `getOrder` / `getOrders` の active・inactive 分類と unit price が各 process 状態で正しいこと
- `LendingMarketReader.getOrderBookDetail` が保存済み opening price と未 finalize 状態を同時に返すこと
- order book depth と best prices が途中状態として取得可能であり、finalize 後の最終 tree と一致すること
- `OrdersCleaned` / `OrdersFilledInAsync` が finalize 前に発生しても `ItayoseExecuted` と `isReady` が finalize まで更新されないこと
- finalize 時に `ItayoseExecuted` が最大 1 回だけ emit され、`totalOffsetAmount == 0` の場合は既存挙動どおり emit されないこと
- initial compound factor 更新が revert した場合、LendingMarket の finalize state とすべての finalize event も rollback すること
- `getItayoseLog` が非ゼロでも `isReady == false` の状態を外部利用者が正しく判別できること
- 未完了 process または期限到来済み未開始 Itayose がある対象または destination order book の rotation が revert すること
- `isInProgress == true` の process がある場合の emergency termination が revert し、全対象 finalize 後は成功すること
- 期限到来済みでも未開始の Itayose は emergency termination を block せず、pre-order が position に変換されないこと
- pause 中は Itayose step および必要な TokenVault 残高更新が revert することを運用手順と合わせて確認すること
- Gelato resolver が既存どおり一括 `executeItayoseCall` を payload に使用し、成功時は 1transaction で finalize まで完了すること
- `tasks/open-markets.ts` が既存どおり一括 `executeItayoseCall` を使用すること
- `tasks/settle-itayose.ts` が currency/maturity を指定して step API を繰り返し、途中状態から再開でき、finalize 後に停止すること
- `ItayoseProcessInitialized`、各 batch の `ItayoseSettlementProgress`、および `ItayoseProcessFinalized` が正しい値と順序で emit されること
- `totalOffsetAmount == 0` でも `ItayoseProcessFinalized` が 1 回 emit されること
- `MarketUnitPrice == 0` の通常注文 fallback
- pre-order の `unitPrice == 0` が関数入口の custom error で revert すること
- `minDebtUnitPrice > PRICE_DIGIT` への更新が revert し、0 と `PRICE_DIGIT` は受け付けること
- min debt 計算では `minDebtUnitPrice >= BASE_MIN_DEBT_UNIT_PRICE` が `BASE_MIN_DEBT_UNIT_PRICE` へ clamp されること
- min debt 計算が現行最大 2 年とビジネス上想定される長期ケースの 10 年で underflow せず、計算値が 1 未満になる場合は 1 へ clamp されること
- 前回 opening price の期間変換
- 前回 opening price が 0 または未 finalize の場合の fallback
- active order book list の先頭、途中、末尾、および list 外 maturity について、直前 order book の探索と fallback が定義どおりになること
- pre-order 期間以外の range getter が通常注文と同じ参考範囲を返すこと
- 運用前提に反して pre-order 期間中に min debt または直前 Itayose 状態が変わった場合、range getter と新規注文 validation が同じ新しい範囲を使用すること
- 価格範囲の境界値 `1` と `10000`
- UI 向け getter と実際の validation 結果の一致
- 注文価格 validation が `cleanUpFunds` と LendingMarket 呼び出しより前に実行され、範囲外注文ではそれらが呼ばれないこと
- 新しい process lifecycle event がすべて LendingMarketController proxy address から emit されること

## 採用しない方針

今回の実装では以下を採用しない。

- pre-order の tick size 拡大
- active price level 総数による注文拒否
- 最低注文額または価格ノード作成 fee
- `calculateItayoseResult` の batch 化
- caller 指定 amount による settlement 分割
- `partiallyFilledOrder[]` の storage 保存
- finalize での可変長ループ

これらは performance test で本方針が gas 要件を満たさない場合の追加候補とする。
