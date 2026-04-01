"""
Signal Engine Autoresearch — Fixed Evaluation Harness
======================================================
DO NOT MODIFY THIS FILE. It is the ground truth.

Contains:
  - All historical price/volume data for 10 tickers (embedded)
  - Complete backtest simulator
  - evaluate() → dict of metrics
  - print_summary() → Karpathy-style output

Imported by engine.py, which runs the full backtest when executed directly.
"""

import math
import statistics
from typing import List, Dict, Tuple, Optional

# ---------------------------------------------------------------------------
# Constants (fixed — do not change)
# ---------------------------------------------------------------------------

EVAL_START_IDX = 12      # minimum bars needed before first signal evaluation
RISK_FREE_WEEKLY = 0.0008  # ~4% annualized, weekly equivalent

# ---------------------------------------------------------------------------
# Embedded Price Data  (parsed from backtest_data.txt)
# Format: (date, close, volume)
# ---------------------------------------------------------------------------

PRICE_DATA: Dict[str, List[Tuple[str, float, int]]] = {
    "NVDA": [
        ("2025-03-07",112.69,341755500),("2025-03-14",121.67,277593500),
        ("2025-03-21",117.70,266498528),("2025-03-28",109.67,229872549),
        ("2025-04-04",94.31,532273810),("2025-04-11",110.93,313417300),
        ("2025-04-17",101.49,292517500),("2025-04-25",111.01,251064700),
        ("2025-05-02",114.50,190194800),("2025-05-09",116.65,132972200),
        ("2025-05-16",135.40,226542500),("2025-05-23",131.29,198821324),
        ("2025-05-30",135.13,333170900),("2025-06-06",141.72,153986200),
        ("2025-06-13",141.97,180820600),("2025-06-20",143.85,242956200),
        ("2025-06-27",157.75,263234539),("2025-07-03",159.34,143716100),
        ("2025-07-11",164.92,193633300),("2025-07-18",172.41,146456416),
        ("2025-07-25",173.50,122316800),("2025-08-01",173.72,204529000),
        ("2025-08-08",182.70,123396700),("2025-08-15",180.45,156602200),
        ("2025-08-22",177.99,172789427),("2025-08-29",174.18,243257900),
        ("2025-09-05",167.02,224441435),("2025-09-12",177.82,124911026),
        ("2025-09-19",176.67,237182143),("2025-09-26",178.19,148573732),
        ("2025-10-03",187.62,137596900),("2025-10-10",183.16,268774400),
        ("2025-10-17",183.22,173135217),("2025-10-24",186.26,131296700),
        ("2025-10-31",202.49,179802200),("2025-11-07",188.15,264942300),
        ("2025-11-14",190.17,186591900),("2025-11-21",178.88,346926200),
        ("2025-11-28",177.00,121332800),("2025-12-05",182.41,143971100),
        ("2025-12-12",175.02,204274918),("2025-12-19",180.99,324925927),
        ("2025-12-26",190.53,139740300),("2026-01-02",188.85,148240500),
        ("2026-01-09",184.86,131327534),("2026-01-16",186.23,187967200),
        ("2026-01-23",187.67,142748100),("2026-01-30",191.13,179489500),
        ("2026-02-06",185.41,231346241),("2026-02-13",182.81,161888021),
        ("2026-02-20",189.82,178422337),("2026-02-27",177.19,311636500),
        ("2026-03-06",177.82,189021949),("2026-03-13",180.25,160988425),
        ("2026-03-20",172.70,241323529),("2026-03-27",167.52,196212684),
    ],
    "AAPL": [
        ("2025-03-07",239.07,46273600),("2025-03-14",213.49,60107600),
        ("2025-03-21",218.27,94127800),("2025-03-28",217.90,39818617),
        ("2025-04-04",188.38,125910913),("2025-04-11",198.15,87435915),
        ("2025-04-17",196.98,52164700),("2025-04-25",209.28,38222300),
        ("2025-05-02",205.35,101010621),("2025-05-09",198.53,36453923),
        ("2025-05-16",211.26,54737900),("2025-05-23",195.27,78432918),
        ("2025-05-30",200.85,70819942),("2025-06-06",203.92,46607700),
        ("2025-06-13",196.45,51447349),("2025-06-20",201.00,96813542),
        ("2025-06-27",201.08,73188600),("2025-07-03",213.55,34955836),
        ("2025-07-11",211.16,39765812),("2025-07-18",211.18,48974600),
        ("2025-07-25",213.88,40268800),("2025-08-01",202.38,104434500),
        ("2025-08-08",229.35,113854000),("2025-08-15",231.59,56038700),
        ("2025-08-22",227.76,42477811),("2025-08-29",232.14,39418437),
        ("2025-09-05",239.69,54870400),("2025-09-12",234.07,55824216),
        ("2025-09-19",245.50,163741314),("2025-09-26",255.46,46076300),
        ("2025-10-03",258.02,49155614),("2025-10-10",245.27,61999100),
        ("2025-10-17",252.29,49147000),("2025-10-24",262.82,38253717),
        ("2025-10-31",270.37,86167123),("2025-11-07",268.47,48227400),
        ("2025-11-14",272.41,47431331),("2025-11-21",271.49,59030832),
        ("2025-11-28",278.85,20135620),("2025-12-05",278.78,47265845),
        ("2025-12-12",278.28,39532900),("2025-12-19",273.67,144632048),
        ("2025-12-26",273.40,21521802),("2026-01-02",271.01,37838100),
        ("2026-01-09",259.37,39997000),("2026-01-16",255.53,72142800),
        ("2026-01-23",248.04,41689000),("2026-01-30",259.48,92443408),
        ("2026-02-06",278.12,50453414),("2026-02-13",255.78,56290700),
        ("2026-02-20",264.58,42070500),("2026-02-27",264.18,72366505),
        ("2026-03-06",257.46,41120042),("2026-03-13",250.12,36930000),
        ("2026-03-20",247.99,88331100),("2026-03-27",248.80,47899998),
    ],
    "MSFT": [
        ("2025-03-07",393.31,22034100),("2025-03-14",388.56,19952846),
        ("2025-03-21",391.26,39675928),("2025-03-28",378.80,21632016),
        ("2025-04-04",359.84,49209900),("2025-04-11",388.45,23839220),
        ("2025-04-17",367.78,21120200),("2025-04-25",391.85,18973200),
        ("2025-05-02",435.28,30757434),("2025-05-09",438.73,15324233),
        ("2025-05-16",454.27,23849800),("2025-05-23",450.18,16883509),
        ("2025-05-30",460.36,34770500),("2025-06-06",470.38,15285624),
        ("2025-06-13",474.96,16814500),("2025-06-20",477.40,37576206),
        ("2025-06-27",495.94,34539236),("2025-07-03",498.84,13984829),
        ("2025-07-11",503.32,16459512),("2025-07-18",510.05,21209700),
        ("2025-07-25",513.71,19125700),("2025-08-01",524.11,28977628),
        ("2025-08-08",522.04,15531009),("2025-08-15",520.17,25213300),
        ("2025-08-22",507.23,24324200),("2025-08-29",506.69,20961600),
        ("2025-09-05",495.00,31994846),("2025-09-12",509.90,23624900),
        ("2025-09-19",517.93,52474100),("2025-09-26",511.46,16213129),
        ("2025-10-03",517.35,15112321),("2025-10-10",510.96,24133840),
        ("2025-10-17",513.58,19867800),("2025-10-24",523.61,15532400),
        ("2025-10-31",517.81,34006424),("2025-11-07",496.82,24019800),
        ("2025-11-14",510.18,28505746),("2025-11-21",472.12,31769248),
        ("2025-11-28",492.01,14386730),("2025-12-05",483.16,22608710),
        ("2025-12-12",478.53,21248102),("2025-12-19",485.92,70836105),
        ("2025-12-26",487.71,8842200),("2026-01-02",472.94,25571600),
        ("2026-01-09",479.28,18491036),("2026-01-16",459.86,34246700),
        ("2026-01-23",465.95,38000200),("2026-01-30",430.29,58566819),
        ("2026-02-06",401.14,53515311),("2026-02-13",401.32,34091600),
        ("2026-02-20",397.23,34015249),("2026-02-27",392.74,51367200),
        ("2026-03-06",408.96,31123900),("2026-03-13",395.55,26848000),
        ("2026-03-20",381.87,50853200),("2026-03-27",356.77,37883400),
    ],
    "TSLA": [
        ("2025-03-07",262.67,102369640),("2025-03-14",249.98,100242300),
        ("2025-03-21",248.71,132728700),("2025-03-28",263.55,123809400),
        ("2025-04-04",239.43,181229400),("2025-04-11",252.31,128948100),
        ("2025-04-17",241.37,83404800),("2025-04-25",284.95,167560700),
        ("2025-05-02",287.21,114454700),("2025-05-09",298.26,132387835),
        ("2025-05-16",349.98,95895700),("2025-05-23",339.34,84654818),
        ("2025-05-30",346.46,123474938),("2025-06-06",295.14,164747700),
        ("2025-06-13",325.31,128964300),("2025-06-20",322.16,108688008),
        ("2025-06-27",323.63,89067049),("2025-07-03",315.35,58042302),
        ("2025-07-11",313.51,79236442),("2025-07-18",329.65,94255000),
        ("2025-07-25",316.06,148227027),("2025-08-01",302.63,89121446),
        ("2025-08-08",329.65,91200319),("2025-08-15",330.56,74319800),
        ("2025-08-22",340.01,94016347),("2025-08-29",333.87,81145700),
        ("2025-09-05",350.84,108989800),("2025-09-12",395.94,168156400),
        ("2025-09-19",426.07,93131034),("2025-09-26",440.40,101628200),
        ("2025-10-03",429.83,133188200),("2025-10-10",413.49,112107900),
        ("2025-10-17",439.31,89331600),("2025-10-24",433.72,94727800),
        ("2025-10-31",456.56,83135800),("2025-11-07",429.52,103471500),
        ("2025-11-14",404.35,105506700),("2025-11-21",391.09,100460633),
        ("2025-11-28",430.17,36252900),("2025-12-05",455.00,56427522),
        ("2025-12-12",458.96,95656749),("2025-12-19",481.20,103305424),
        ("2025-12-26",475.19,58780700),("2026-01-02",438.07,85535406),
        ("2026-01-09",445.01,67331500),("2026-01-16",437.50,60220600),
        ("2026-01-23",449.06,56771400),("2026-01-30",430.41,82626100),
        ("2026-02-06",411.11,62677144),("2026-02-13",417.44,51434147),
        ("2026-02-20",411.82,57912225),("2026-02-27",402.51,56890100),
        ("2026-03-06",396.73,64054600),("2026-03-13",391.20,58504100),
        ("2026-03-20",367.96,78628603),("2026-03-27",361.83,62065659),
    ],
    "META": [
        ("2025-03-07",625.66,21375700),("2025-03-14",607.60,12364505),
        ("2025-03-21",596.25,25015900),("2025-03-28",576.74,17602823),
        ("2025-04-04",504.73,38589814),("2025-04-11",543.57,17642327),
        ("2025-04-17",501.48,14593508),("2025-04-25",547.27,17098921),
        ("2025-05-02",597.02,24739300),("2025-05-09",592.49,10427300),
        ("2025-05-16",640.34,18519000),("2025-05-23",627.06,8454100),
        ("2025-05-30",647.49,16241000),("2025-06-06",697.71,11728000),
        ("2025-06-13",682.87,9274441),("2025-06-20",682.35,22538640),
        ("2025-06-27",733.63,18775735),("2025-07-03",719.01,8601700),
        ("2025-07-11",717.51,10873900),("2025-07-18",704.28,12779800),
        ("2025-07-25",712.68,8271700),("2025-08-01",750.01,19028710),
        ("2025-08-08",769.30,7320800),("2025-08-15",785.23,13375400),
        ("2025-08-22",754.79,10612700),("2025-08-29",738.70,9070546),
        ("2025-09-05",752.45,9663441),("2025-09-12",755.59,8248600),
        ("2025-09-19",778.38,23696824),("2025-09-26",743.75,9696338),
        ("2025-10-03",710.56,16154305),("2025-10-10",705.30,16980100),
        ("2025-10-17",716.92,12232441),("2025-10-24",738.36,9151300),
        ("2025-10-31",648.35,56953200),("2025-11-07",621.71,29946826),
        ("2025-11-14",609.46,20724146),("2025-11-21",594.25,21052624),
        ("2025-11-28",647.95,11033200),("2025-12-05",673.42,21207900),
        ("2025-12-12",644.23,14016915),("2025-12-19",658.77,49977100),
        ("2025-12-26",663.29,7133813),("2026-01-02",650.41,13726517),
        ("2026-01-09",653.06,11634944),("2026-01-16",620.25,17012516),
        ("2026-01-23",658.76,22797723),("2026-01-30",716.50,23744600),
        ("2026-02-06",661.46,18159300),("2026-02-13",639.77,12336400),
        ("2026-02-20",655.66,14183512),("2026-02-27",648.18,15703041),
        ("2026-03-06",644.86,13159400),("2026-03-13",613.71,18957637),
        ("2026-03-20",593.66,21214900),("2026-03-27",525.72,30133010),
    ],
    "GOOGL": [
        ("2025-03-07",173.86,27385813),("2025-03-14",165.49,31995900),
        ("2025-03-21",163.99,36625800),("2025-03-28",154.33,48669335),
        ("2025-04-04",145.60,62259539),("2025-04-11",157.14,33636239),
        ("2025-04-17",151.16,33046600),("2025-04-25",161.96,56034000),
        ("2025-05-02",164.03,25715005),("2025-05-09",152.75,32435300),
        ("2025-05-16",166.19,42846925),("2025-05-23",168.47,35211439),
        ("2025-05-30",171.74,52639911),("2025-06-06",173.68,35731832),
        ("2025-06-13",174.67,27663107),("2025-06-20",166.64,75659917),
        ("2025-06-27",178.53,108140200),("2025-07-03",179.53,21689729),
        ("2025-07-11",180.19,34282922),("2025-07-18",185.06,34014509),
        ("2025-07-25",193.18,39785900),("2025-08-01",189.13,34832200),
        ("2025-08-08",201.42,39161826),("2025-08-15",203.90,34931422),
        ("2025-08-22",206.09,42827040),("2025-08-29",212.91,39728400),
        ("2025-09-05",235.00,46588925),("2025-09-12",240.80,26771610),
        ("2025-09-19",254.72,55571424),("2025-09-26",246.54,18503200),
        ("2025-10-03",245.35,30249600),("2025-10-10",236.57,33180323),
        ("2025-10-17",253.30,29671629),("2025-10-24",259.92,28655126),
        ("2025-10-31",281.19,39267945),("2025-11-07",278.83,34479600),
        ("2025-11-14",276.41,31647227),("2025-11-21",299.66,74137700),
        ("2025-11-28",320.18,26018600),("2025-12-05",321.27,28851705),
        ("2025-12-12",309.29,35940200),("2025-12-19",307.16,59943239),
        ("2025-12-26",313.51,10899017),("2026-01-02",315.15,32009400),
        ("2026-01-09",328.57,26214200),("2026-01-16",330.00,40341637),
        ("2026-01-23",327.93,27280000),("2026-01-30",338.00,31024000),
        ("2026-02-06",322.86,56380500),("2026-02-13",305.72,38499701),
        ("2026-02-20",314.98,53210820),("2026-02-27",311.76,44640640),
        ("2026-03-06",298.52,25576916),("2026-03-13",302.28,23693100),
        ("2026-03-20",301.00,44364100),("2026-03-27",274.34,35890612),
    ],
    "AMZN": [
        ("2025-03-07",199.25,59802821),("2025-03-14",197.95,38096700),
        ("2025-03-21",196.21,60056917),("2025-03-28",192.72,52548226),
        ("2025-04-04",171.00,123159400),("2025-04-11",184.87,50594339),
        ("2025-04-17",172.61,44726453),("2025-04-25",188.99,36414330),
        ("2025-05-02",189.98,77903500),("2025-05-09",193.06,29663143),
        ("2025-05-16",205.59,43318500),("2025-05-23",200.99,33393545),
        ("2025-05-30",205.01,51679406),("2025-06-06",213.57,39832500),
        ("2025-06-13",212.10,29337800),("2025-06-20",209.69,75350733),
        ("2025-06-27",223.30,119217138),("2025-07-03",223.41,29632400),
        ("2025-07-11",225.02,50518307),("2025-07-18",226.13,37833807),
        ("2025-07-25",231.44,28712100),("2025-08-01",214.75,122258801),
        ("2025-08-08",222.69,32970500),("2025-08-15",231.03,39649244),
        ("2025-08-22",228.84,37315341),("2025-08-29",229.00,26199200),
        ("2025-09-05",232.33,36721802),("2025-09-12",228.15,38496218),
        ("2025-09-19",231.48,97943200),("2025-09-26",219.78,41650100),
        ("2025-10-03",219.51,43639033),("2025-10-10",216.37,72367511),
        ("2025-10-17",213.04,45986944),("2025-10-24",224.21,38685100),
        ("2025-10-31",244.22,166340808),("2025-11-07",244.41,46374300),
        ("2025-11-14",234.69,38956700),("2025-11-21",220.69,68490500),
        ("2025-11-28",233.22,20292329),("2025-12-05",229.53,33117400),
        ("2025-12-12",226.19,35639118),("2025-12-19",227.35,85544400),
        ("2025-12-26",232.52,15994726),("2026-01-02",226.50,51456229),
        ("2026-01-09",247.38,34560000),("2026-01-16",239.12,45888300),
        ("2026-01-23",239.16,33778500),("2026-01-30",239.30,46585024),
        ("2026-02-06",210.32,179383581),("2026-02-13",198.79,66321600),
        ("2026-02-20",210.11,65881611),("2026-02-27",210.00,57422800),
        ("2026-03-06",213.21,51152716),("2026-03-13",207.67,35662137),
        ("2026-03-20",205.37,63694603),("2026-03-27",199.34,56009763),
    ],
    "JPM": [
        ("2025-03-07",242.28,20498734),("2025-03-14",232.44,11962108),
        ("2025-03-21",241.63,19326900),("2025-03-28",242.85,11978417),
        ("2025-04-04",210.28,27170700),("2025-04-11",236.20,20284500),
        ("2025-04-17",231.96,9557946),("2025-04-25",243.55,8588600),
        ("2025-05-02",252.51,7165044),("2025-05-09",253.08,5087639),
        ("2025-05-16",267.56,8932912),("2025-05-23",260.71,6671841),
        ("2025-05-30",264.00,10977700),("2025-06-06",265.73,7738134),
        ("2025-06-13",264.95,7098300),("2025-06-20",275.00,13969700),
        ("2025-06-27",287.11,17868633),("2025-07-03",296.00,6541646),
        ("2025-07-11",286.86,7384700),("2025-07-18",291.27,12217018),
        ("2025-07-25",298.62,5918875),("2025-08-01",289.37,12007111),
        ("2025-08-08",288.76,6634506),("2025-08-15",290.49,7340518),
        ("2025-08-22",296.24,8552847),("2025-08-29",301.42,6796400),
        ("2025-09-05",294.38,9837709),("2025-09-12",306.91,6846700),
        ("2025-09-19",314.78,23568600),("2025-09-26",316.06,7258136),
        ("2025-10-03",310.03,6029900),("2025-10-10",300.89,8597400),
        ("2025-10-17",297.56,10153500),("2025-10-24",300.44,7228330),
        ("2025-10-31",311.12,7721300),("2025-11-07",314.21,7302347),
        ("2025-11-14",303.61,10327000),("2025-11-21",298.02,11766810),
        ("2025-11-28",313.08,4322448),("2025-12-05",315.04,6518908),
        ("2025-12-12",318.52,8982911),("2025-12-19",317.21,24494412),
        ("2025-12-26",327.91,4158300),("2026-01-02",325.48,8054040),
        ("2026-01-09",329.19,6738143),("2026-01-16",312.47,14652508),
        ("2026-01-23",297.72,11107925),("2026-01-30",305.89,11953200),
        ("2026-02-06",322.40,17797443),("2026-02-13",302.55,9114526),
        ("2026-02-20",310.79,7792735),("2026-02-27",300.30,18620800),
        ("2026-03-06",289.48,13496526),("2026-03-13",283.44,9091200),
        ("2026-03-20",286.56,22436500),("2026-03-27",282.84,9873292),
    ],
    "JNJ": [
        ("2025-03-07",166.69,9637600),("2025-03-14",162.81,6235800),
        ("2025-03-21",163.63,17047106),("2025-03-28",163.71,5760545),
        ("2025-04-04",153.24,16601728),("2025-04-11",151.73,9943900),
        ("2025-04-17",157.47,10981100),("2025-04-25",154.58,8643927),
        ("2025-05-02",156.12,5974539),("2025-05-09",154.22,6520449),
        ("2025-05-16",151.33,8051200),("2025-05-23",152.94,6727539),
        ("2025-05-30",155.21,15529716),("2025-06-06",155.03,5391841),
        ("2025-06-13",157.10,6587849),("2025-06-20",149.79,22605500),
        ("2025-06-27",152.41,10010800),("2025-07-03",156.01,3482521),
        ("2025-07-11",156.90,7872172),("2025-07-18",163.70,9793046),
        ("2025-07-25",168.30,6255183),("2025-08-01",167.33,8928229),
        ("2025-08-08",173.33,7686800),("2025-08-15",176.64,9477600),
        ("2025-08-22",179.29,9524308),("2025-08-29",177.17,6942311),
        ("2025-09-05",178.43,9733803),("2025-09-12",178.06,7220473),
        ("2025-09-19",176.19,25621000),("2025-09-26",179.71,8634403),
        ("2025-10-03",188.64,8675100),("2025-10-10",190.72,9598019),
        ("2025-10-17",193.22,7764449),("2025-10-24",190.40,6903400),
        ("2025-10-31",188.87,8791700),("2025-11-07",186.57,6959209),
        ("2025-11-14",195.93,8824847),("2025-11-21",203.90,13189100),
        ("2025-11-28",206.92,5638300),("2025-12-05",201.93,7785552),
        ("2025-12-12",211.58,6922700),("2025-12-19",206.37,24803920),
        ("2025-12-26",207.63,2316730),("2026-01-02",207.35,6325672),
        ("2026-01-09",204.39,6154326),("2026-01-16",218.66,10021515),
        ("2026-01-23",220.14,6951040),("2026-01-30",227.25,11045529),
        ("2026-02-06",239.99,8274034),("2026-02-13",243.45,13268519),
        ("2026-02-20",242.49,13565800),("2026-02-27",248.43,16428600),
        ("2026-03-06",240.40,7179800),("2026-03-13",241.52,6415539),
        ("2026-03-20",235.37,17156623),("2026-03-27",240.45,7617616),
    ],
    "PLTR": [
        ("2025-03-07",84.91,105377100),("2025-03-14",86.24,113985000),
        ("2025-03-21",90.96,116748700),("2025-03-28",85.85,91091700),
        ("2025-04-04",74.01,147323200),("2025-04-11",88.55,95130700),
        ("2025-04-17",93.78,83991800),("2025-04-25",112.78,103933800),
        ("2025-05-02",124.28,103094300),("2025-05-09",117.30,81005300),
        ("2025-05-16",129.52,57003724),("2025-05-23",123.31,65905836),
        ("2025-05-30",131.78,185897600),("2025-06-06",127.72,87175144),
        ("2025-06-13",137.40,93519043),("2025-06-20",137.30,87067039),
        ("2025-06-27",130.74,202598647),("2025-07-03",134.36,41812500),
        ("2025-07-11",142.10,52134812),("2025-07-18",153.52,45771634),
        ("2025-07-25",158.80,57972341),("2025-08-01",154.27,61287000),
        ("2025-08-08",186.96,62657935),("2025-08-15",177.17,60288736),
        ("2025-08-22",158.74,102099200),("2025-08-29",156.71,45270502),
        ("2025-09-05",153.11,81855900),("2025-09-12",171.43,54498535),
        ("2025-09-19",182.39,109129929),("2025-09-26",177.57,44275800),
        ("2025-10-03",173.07,105533447),("2025-10-10",175.44,55194034),
        ("2025-10-17",178.15,43421500),("2025-10-24",184.63,34813500),
        ("2025-10-31",200.47,52697644),("2025-11-07",177.93,73989700),
        ("2025-11-14",174.01,62596800),("2025-11-21",154.85,71346400),
        ("2025-11-28",168.45,17199500),("2025-12-05",181.76,32079300),
        ("2025-12-12",183.57,42427400),("2025-12-19",193.38,76929400),
        ("2025-12-26",188.71,26262000),("2026-01-02",167.86,60634100),
        ("2026-01-09",177.49,31362900),("2026-01-16",170.96,59483601),
        ("2026-01-23",169.60,30285700),("2026-01-30",146.59,47271042),
        ("2026-02-06",135.90,62661425),("2026-02-13",131.41,49438100),
        ("2026-02-20",135.24,53726811),("2026-02-27",137.19,59412400),
        ("2026-03-06",157.16,74980900),("2026-03-13",150.95,42460600),
        ("2026-03-20",150.68,48700200),("2026-03-27",143.06,35790820),
    ],
}

# Fixed fundamental quality scores (0-100)
QUALITY_FIXED: Dict[str, int] = {
    "NVDA": 88, "AAPL": 85, "MSFT": 90, "TSLA": 55, "META": 82,
    "GOOGL": 88, "AMZN": 80, "JPM": 78, "JNJ": 82, "PLTR": 50,
}

# ---------------------------------------------------------------------------
# Core backtest runner — called by engine.py
# ---------------------------------------------------------------------------

def run_backtest(params: dict) -> dict:
    """
    Run a full backtest using the signal parameters in `params`.
    Returns a dict with all metrics.

    params keys (all come from engine.py):
      weights: dict with keys momentum, mean_reversion, quality, flow, risk, crowding
      zscore_mean: float  (default 50)
      zscore_sd: float    (default 16.67)
      sigmoid_steepness: float (default 1.5)
      kelly_fraction: float (default 0.25)
      max_position_pct: float (default 0.15)
      payoff_ratio: float (default 2.0)
      transaction_cost_bps: float (default 10)
      slippage_bps: float (default 5)
      trailing_stop_pct: float (default 3.0)
      take_profit_pct: float (default 8.0)
      momentum_reversal_threshold_pct: float (default -5.0)
      momentum_reversal_min_pnl_pct: float (default 2.0)
      breakeven_buffer_pct: float (default 0.5)
      max_hold_weeks: int (default 6)
      kill_switch_drawdown_pct: float (default 10.0)
      buy_prob_threshold: float (default 0.55)
      buy_edge_threshold: float (default 0.1)
      crowding_override: dict (ticker->int, optional)
      empirical_prob_map: list of (threshold, prob) sorted descending, optional
      compute_signals: callable, optional (overrides default signal computation)
    """
    weights            = params["weights"]
    zscore_mean        = params.get("zscore_mean", 50.0)
    zscore_sd          = params.get("zscore_sd", 16.67)
    sigmoid_k          = params.get("sigmoid_steepness", 1.5)
    kelly_c            = params.get("kelly_fraction", 0.25)
    max_pos            = params.get("max_position_pct", 0.15)
    payoff             = params.get("payoff_ratio", 2.0)
    tc_bps             = params.get("transaction_cost_bps", 10.0)
    slip_bps           = params.get("slippage_bps", 5.0)
    trail_stop         = params.get("trailing_stop_pct", 3.0)
    take_profit        = params.get("take_profit_pct", 8.0)
    mom_rev_thresh     = params.get("momentum_reversal_threshold_pct", -5.0)
    mom_rev_min_pnl    = params.get("momentum_reversal_min_pnl_pct", 2.0)
    breakeven_buf      = params.get("breakeven_buffer_pct", 0.5)
    max_hold           = params.get("max_hold_weeks", 6)
    kill_dd            = params.get("kill_switch_drawdown_pct", 10.0)
    buy_prob_thresh    = params.get("buy_prob_threshold", 0.55)
    buy_edge_thresh    = params.get("buy_edge_threshold", 0.1)
    crowding_override  = params.get("crowding_override", {})
    empirical_prob_map = params.get("empirical_prob_map", None)
    compute_signals_fn = params.get("compute_signals", None)

    # Crowding table: start from default, apply any overrides
    crowding_table = {
        "NVDA": 75, "AAPL": 65, "MSFT": 60, "TSLA": 65, "META": 55,
        "GOOGL": 55, "AMZN": 65, "JPM": 40, "JNJ": 35, "PLTR": 70,
    }
    crowding_table.update(crowding_override)

    def z(x: float) -> float:
        return (x - zscore_mean) / zscore_sd

    def composite_score(mom, mr, qual, fl, rsk, crow):
        return (
            weights["momentum"]       * z(mom) +
            weights["mean_reversion"] * z(mr) +
            weights["quality"]        * z(qual) +
            weights["flow"]           * z(fl) -
            weights["risk"]           * z(rsk) -
            weights["crowding"]       * z(crow)
        )

    def to_probability(score: float) -> float:
        if empirical_prob_map is not None:
            for threshold, prob in empirical_prob_map:
                if score > threshold:
                    return prob
            return empirical_prob_map[-1][1]
        # Default empirical calibration from scoring-engine.ts
        if score > 1.0:  return 0.72
        if score > 0.8:  return 0.68
        if score > 0.5:  return 0.62
        if score > 0.3:  return 0.56
        if score > 0.1:  return 0.52
        if score > 0.0:  return 0.48
        if score > -0.3: return 0.42
        return 0.35

    def kelly_size(prob: float) -> float:
        num = prob * payoff - (1 - prob)
        frac = (num / payoff) * kelly_c
        return max(0.0, min(frac, max_pos))

    # Portfolio-level tracking
    # NOTE: The kill switch (equity drops >kill_dd%) is tracked post-hoc but NOT
    # applied as a hard entry blocker during sequential per-ticker simulation.
    # This matches backtest_v2.py's approach — concurrent positions cannot be
    # accurately tracked in a sequential simulation. Kill switch affects conviction
    # sizing multiplier but does not block entries.
    portfolio_equity   = 1.0
    portfolio_peak     = 1.0
    all_trades         = []
    weekly_returns     = []   # one entry per week with open positions

    for ticker, rows in PRICE_DATA.items():
        dates  = [r[0] for r in rows]
        closes = [r[1] for r in rows]
        vols   = [r[2] for r in rows]

        for i in range(EVAL_START_IDX, len(closes)):
            c_win = closes[:i+1]
            v_win = vols[:i+1]

            if compute_signals_fn is not None:
                signals = compute_signals_fn(ticker, c_win, v_win, QUALITY_FIXED, crowding_table)
                mom, mr, qual, fl, rsk, crow = (
                    signals["momentum"], signals["mean_reversion"],
                    signals["quality"], signals["flow"],
                    signals["risk"], signals["crowding"]
                )
            else:
                mom  = _compute_momentum(c_win, v_win)
                mr   = _compute_mean_reversion(c_win)
                qual = QUALITY_FIXED[ticker]
                fl   = _compute_flow(v_win)
                rsk  = _compute_risk(c_win[-12:])
                crow = crowding_table[ticker]

            sc   = composite_score(mom, mr, qual, fl, rsk, crow)
            prob = to_probability(sc)
            tc   = tc_bps / 10000.0
            edge = prob * payoff - (1 - prob) - tc

            action = "WATCH"
            if prob >= buy_prob_thresh and edge > buy_edge_thresh:
                action = "BUY"

            if action != "BUY":
                continue

            # Conviction sizing — use 0 drawdown as placeholder (matches v2 approach)
            # so score-based scaling applies without sequential-simulation drawdown distortion
            conv_mult = _conviction_mult(sc, 0.0)
            if conv_mult == 0.0:
                conv_mult = 1.0

            # Entry with slippage
            entry_price = closes[i] * (1 + slip_bps / 10000.0)
            position_size = kelly_size(prob) * conv_mult

            # Intra-hold risk management
            hwm           = entry_price
            partial_taken = False
            partial_ret   = 0.0
            exit_price    = None
            exit_idx_     = None
            exit_rule     = "TIME_STOP"

            for week in range(1, max_hold + 1):
                j = i + week
                if j >= len(closes):
                    exit_price = closes[-1]
                    exit_idx_  = len(closes) - 1
                    exit_rule  = "TIME_STOP"
                    break

                price = closes[j]
                hwm   = max(hwm, price)
                pnl_pct    = (price - entry_price) / entry_price * 100
                dd_from_hwm = (hwm - price) / hwm * 100

                # Rule 1: Trailing stop -trail_stop% from HWM
                if dd_from_hwm >= trail_stop:
                    exit_price = price
                    exit_idx_  = j
                    exit_rule  = "TAKE_PROFIT_THEN_TRAILING" if partial_taken else "TRAILING_STOP"
                    break

                # Rule 2: Take profit +take_profit% — sell half
                if not partial_taken and pnl_pct >= take_profit:
                    partial_taken = True
                    partial_ret   = pnl_pct / 100.0

                # Rule 3: Momentum reversal
                if j >= 4:
                    four_w_ago  = closes[j - 4]
                    four_w_ret  = (price - four_w_ago) / four_w_ago * 100
                    if four_w_ret < mom_rev_thresh and pnl_pct < mom_rev_min_pnl:
                        exit_price = price
                        exit_idx_  = j
                        exit_rule  = "TAKE_PROFIT_THEN_TRAILING" if partial_taken else "MOMENTUM_REVERSAL"
                        break

                # Rule 4: Breakeven stop — after partial, if near entry
                if partial_taken and pnl_pct < breakeven_buf:
                    exit_price = price
                    exit_idx_  = j
                    exit_rule  = "TAKE_PROFIT_THEN_BREAKEVEN"
                    break

                # Rule 5: Time stop
                if week == max_hold:
                    exit_price = price
                    exit_idx_  = j
                    exit_rule  = "TAKE_PROFIT_THEN_TIME" if partial_taken else "TIME_STOP"
                    break

            if exit_price is None:
                exit_price = closes[-1]
                exit_idx_  = len(closes) - 1
                exit_rule  = "TAKE_PROFIT_THEN_TIME" if partial_taken else "TIME_STOP"

            # Blended return
            remainder_ret = (exit_price - entry_price) / entry_price
            if partial_taken:
                blended_ret = 0.5 * partial_ret + 0.5 * remainder_ret
            else:
                blended_ret = remainder_ret

            # Transaction costs (round-trip)
            blended_ret -= (tc_bps / 10000.0)

            win        = blended_ret > 0
            hold_weeks = exit_idx_ - i

            all_trades.append({
                "ticker": ticker,
                "entry_date": dates[i],
                "exit_date": dates[exit_idx_],
                "entry_price": entry_price,
                "exit_price": exit_price,
                "ret": blended_ret,
                "win": win,
                "position_size": position_size,
                "exit_rule": exit_rule,
                "hold_weeks": hold_weeks,
                "score": sc,
                "prob": prob,
            })

            # Update portfolio equity (simplified: assume equal-weighted contribution)
            portfolio_equity *= (1 + blended_ret * position_size)
            portfolio_peak   = max(portfolio_peak, portfolio_equity)

            # Record weekly return for this trade's contribution
            weekly_returns.append(blended_ret)

    if len(all_trades) == 0:
        return {
            "sharpe_ratio": 0.0,
            "total_return_pct": 0.0,
            "max_drawdown_pct": 0.0,
            "win_rate": 0.0,
            "total_trades": 0,
            "avg_win_pct": 0.0,
            "avg_loss_pct": 0.0,
        }

    rets       = [t["ret"] for t in all_trades]
    wins       = [t for t in all_trades if t["win"]]
    losses     = [t for t in all_trades if not t["win"]]

    win_rate   = len(wins) / len(all_trades) * 100
    avg_win    = (sum(t["ret"] for t in wins) / len(wins) * 100) if wins else 0.0
    avg_loss   = (sum(t["ret"] for t in losses) / len(losses) * 100) if losses else 0.0

    # Total return = product of (1 + position_size * ret) - 1
    total_return = (portfolio_equity - 1.0) * 100

    # Sharpe ratio from trade returns (annualized, sqrt(13) for 13 4-week periods/year)
    sharpe = _compute_sharpe(rets)

    # Max drawdown from equity curve
    max_dd = _compute_max_drawdown(all_trades)

    return {
        "sharpe_ratio":      round(sharpe, 4),
        "total_return_pct":  round(total_return, 2),
        "max_drawdown_pct":  round(max_dd, 2),
        "win_rate":          round(win_rate, 2),
        "total_trades":      len(all_trades),
        "avg_win_pct":       round(avg_win, 2),
        "avg_loss_pct":      round(avg_loss, 2),
    }


def evaluate(params: dict) -> dict:
    """Public interface — returns metrics dict."""
    return run_backtest(params)


def print_summary(metrics: dict) -> None:
    """Print results in Karpathy format."""
    print("---")
    print(f"sharpe_ratio:     {metrics['sharpe_ratio']:.3f}")
    print(f"total_return_pct: {metrics['total_return_pct']:.2f}")
    print(f"max_drawdown_pct: {metrics['max_drawdown_pct']:.2f}")
    print(f"win_rate:         {metrics['win_rate']:.2f}")
    print(f"total_trades:     {metrics['total_trades']}")
    print(f"avg_win_pct:      {metrics['avg_win_pct']:.2f}")
    print(f"avg_loss_pct:     {metrics['avg_loss_pct']:.2f}")


# ---------------------------------------------------------------------------
# Signal computation helpers (fixed, called by run_backtest unless overridden)
# ---------------------------------------------------------------------------

def _compute_momentum(closes: List[float], vols: List[float]) -> float:
    p_now  = closes[-1]
    p_4w   = closes[-5]  if len(closes) >= 5  else closes[0]
    p_12w  = closes[-13] if len(closes) >= 13 else closes[0]

    ret4  = p_now / p_4w  - 1
    ret12 = p_now / p_12w - 1

    avg_vol_last_2w = (vols[-1] + vols[-2]) / 2
    avg_vol_last_8w = sum(vols[-8:]) / min(8, len(vols))
    vol_ratio = avg_vol_last_2w / avg_vol_last_8w if avg_vol_last_8w > 0 else 1.0

    combined = 0.4 * ret4 + 0.4 * ret12 + 0.2 * (vol_ratio - 1)

    if   combined > 0.25:  return 90
    elif combined > 0.15:  return 80
    elif combined > 0.08:  return 70
    elif combined > 0.03:  return 60
    elif combined > -0.03: return 50
    elif combined > -0.08: return 40
    elif combined > -0.15: return 30
    else:                  return 20


def _compute_mean_reversion(closes: List[float]) -> float:
    sma12     = sum(closes[-12:]) / min(12, len(closes))
    deviation = (closes[-1] - sma12) / sma12 if sma12 != 0 else 0

    if   deviation < -0.15: return 85
    elif deviation < -0.08: return 72
    elif deviation < -0.03: return 60
    elif deviation <  0.03: return 50
    elif deviation <  0.08: return 40
    elif deviation <  0.15: return 30
    else:                   return 18


def _compute_flow(vols: List[float]) -> float:
    avg_last_2w = (vols[-1] + vols[-2]) / 2
    avg_all     = sum(vols) / len(vols)
    vol_ratio   = avg_last_2w / avg_all if avg_all > 0 else 1.0

    if   vol_ratio > 2.0: return 80
    elif vol_ratio > 1.5: return 70
    elif vol_ratio > 1.1: return 60
    elif vol_ratio > 0.8: return 50
    else:                 return 35


def _compute_risk(closes: List[float]) -> float:
    rets = [closes[i] / closes[i-1] - 1 for i in range(1, len(closes))]
    if len(rets) < 2:
        return 45
    std_w   = statistics.stdev(rets)
    ann_vol = std_w / math.sqrt(5) * math.sqrt(252)

    if   ann_vol > 0.60: return 85
    elif ann_vol > 0.45: return 72
    elif ann_vol > 0.30: return 58
    elif ann_vol > 0.20: return 45
    elif ann_vol > 0.12: return 32
    else:                return 20


def _conviction_mult(composite_score: float, portfolio_drawdown_pct: float) -> float:
    if portfolio_drawdown_pct >= 10.0:
        return 0.0
    mult = 1.0
    if   composite_score > 1.0: mult *= 1.3
    elif composite_score > 0.5: mult *= 1.1
    elif composite_score < 0.0: mult *= 0.5
    if   portfolio_drawdown_pct > 8: mult *= 0.5
    elif portfolio_drawdown_pct > 5: mult *= 0.7
    return mult


def _compute_sharpe(rets: List[float]) -> float:
    """Annualized Sharpe from trade return series (sqrt(52) weekly annualization)."""
    if len(rets) < 2:
        return 0.0
    mu  = sum(rets) / len(rets)
    try:
        std = statistics.stdev(rets)
    except statistics.StatisticsError:
        return 0.0
    if std == 0.0:
        return 0.0
    # Annualize assuming ~52 trades per year (weekly data)
    return (mu - RISK_FREE_WEEKLY) / std * math.sqrt(52)


def _compute_max_drawdown(trades: list) -> float:
    """Compute max drawdown from sequential trade P&L."""
    if not trades:
        return 0.0
    equity = 1.0
    peak   = 1.0
    max_dd = 0.0
    for t in sorted(trades, key=lambda x: x["entry_date"]):
        equity = equity * (1 + t["ret"] * t["position_size"])
        peak   = max(peak, equity)
        dd     = (peak - equity) / peak * 100
        max_dd = max(max_dd, dd)
    return max_dd


# ---------------------------------------------------------------------------
# Validation — run when imported as __main__
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("prepare.py — validating embedded data...")
    for ticker, rows in PRICE_DATA.items():
        assert len(rows) == 56, f"{ticker}: expected 56 rows, got {len(rows)}"
        for row in rows:
            assert len(row) == 3, f"{ticker}: malformed row {row}"
            assert isinstance(row[1], (int, float)) and row[1] > 0
            assert isinstance(row[2], int) and row[2] > 0
    print(f"  {len(PRICE_DATA)} tickers, {len(next(iter(PRICE_DATA.values())))} rows each — OK")

    # Quick smoke test
    from engine import PARAMS
    metrics = evaluate(PARAMS)
    print_summary(metrics)
    print("prepare.py validation passed.")
