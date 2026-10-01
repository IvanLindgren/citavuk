import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/document_parser.dart';
import 'package:srbski_read/utils/pages.dart';
import 'package:srbski_read/utils/reflow.dart';

void main() {
  test('PDF на телефоне не размножается по числу ядер', () {
    expect(DocumentParser.pdfWorkerCount(1000000, 8, mobile: true), 1);
    expect(DocumentParser.pdfWorkerCount(12000000, 16, mobile: false), 1);
    expect(DocumentParser.pdfWorkerCount(1000000, 16, mobile: false), 2);
  });
  test('точная страница внутри главы восстанавливается после открытия', () {
    final text=('Вук чита књигу поред прозора и размишља о путовању 🐺. ' * 100).trim();
    final pages=paginate([text]);
    expect(pages.length, greaterThan(3));
    expect(pageForPosition(pages,0),0);
    for(var i=0;i<pages.length;i++){
      expect(pageForPosition(pages,pages[i].start,offset:pages[i].offset),i);
      expect(text.substring(pages[i].offset).startsWith(pages[i].texts.first),isTrue);
    }
  });
  test('обтекание иллюстрации не разрывает каждую строку', () {
    final lines=<LayoutLine>[
      (text:'Alisa je sedela pored',left:100,right:250),
      (text:'svoje sestre i gledala',left:100,right:250),
      (text:'u knjigu koju je čitala.',left:100,right:250),
      (text:'Zatim je videla zeca koji je brzo trčao pored njih.',left:100,right:500),
    ];
    expect(reflowDocumentWithLayout([lines]).first,'Alisa je sedela pored svoje sestre i gledala u knjigu koju je čitala.');
    final shifted=[for(final l in lines)(text:l.text,left:l.right==250?300.0:100.0,right:500.0)];
    expect(reflowDocumentWithLayout([shifted]).join(' '),lines.map((l)=>l.text).join(' '));
  });
}
