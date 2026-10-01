// Synthetic NBC-shaped OFX 1.0.2; no values copied from a customer statement.
export const statement = (
  transactions = transaction(),
  account = "synthetic-account"
) => `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252
<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><FI><ORG>Example Bank<FID>999</FI></SONRS></SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>CAD<CCACCTFROM><ACCTID>${account}</CCACCTFROM><BANKTRANLIST>${transactions}</BANKTRANLIST><LEDGERBAL><BALAMT>-12.34<DTASOF>20260930000000</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
export function transaction(
  id = "synthetic-1",
  amount = "-12.34",
  date = "20260929120000[-5:EST]"
) {
  return `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${date}<TRNAMT>${amount}<FITID>${id}<NAME>Café &amp; market</STMTTRN>`;
}
