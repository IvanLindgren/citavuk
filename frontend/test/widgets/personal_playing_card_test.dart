import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/widgets/personal_playing_card.dart';

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('все декоративные спрайты включены в приложение',()async{
  for(final name in ['engraved_frame','ravanica_medallion','glint','glow','flare']){
   final bytes=await rootBundle.load('assets/imgs/card_$name.png');
   expect(bytes.lengthInBytes,greaterThan(100));
   expect(bytes.buffer.asUint8List(bytes.offsetInBytes,8),[137,80,78,71,13,10,26,10]);
  }
 });
 testWidgets('уменьшение движения отключает сцену блика',(tester)async{
  await tester.pumpWidget(MaterialApp(home:MediaQuery(data:const MediaQueryData(disableAnimations:true),child:Scaffold(body:SizedBox(width:240,height:400,
   child:PersonalPlayingCard(day:1,month:9,title:'Первый урок',subtitle:'Чтение',kind:'reading',ready:true,today:true,onTap:(){}))))));
  await tester.pumpAndSettle();
  expect(tester.takeException(),isNull);
  expect(tester.binding.hasScheduledFrame,isFalse);
 });
 for(final width in [220.0,300.0]){
  testWidgets('карта с длинным названием при ширине $width',(tester)async{
   await tester.pumpWidget(MaterialApp(home:Scaffold(body:Center(child:SizedBox(width:width,height:width/.67,
    child:PersonalPlayingCard(day:12,month:9,title:'Разговор в сербской книжной лавке',subtitle:'Понимание речи',kind:'listening',ready:false,today:false,onTap:(){}))))));
   await tester.pumpAndSettle();
   expect(tester.takeException(),isNull);
   expect(find.text('12'),findsNWidgets(2));
   expect(find.text('♥'),findsNWidgets(2));
   expect(find.text('Закрыта'),findsOneWidget);
  });
 }
 test('масти различают типы уроков',(){expect(personalSuit('grammar'),'♣');expect(personalSuit('vocabulary'),'♦');expect(personalSuit('reading'),'♠');});
}
