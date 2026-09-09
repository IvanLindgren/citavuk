import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/auth_service.dart';
import 'package:srbski_read/services/study_service.dart';
import 'package:srbski_read/services/daily_service.dart';
import 'package:srbski_read/models/personal_lesson.dart';

class FakeStudyAuth extends AuthService {
 FakeStudyAuth():super(api:ApiClient(baseUrl:'https://example.invalid',token:'a'));
 String owner='a';
 @override Account? get account=>Account(id:owner,email:'test@example.test',displayName:'Тест');
 @override bool get isSignedIn=>owner.isNotEmpty;
 void switchTo(String next){owner=next;api.token=next;notifyListeners();}
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('слепок серии не переименовывает слова чужого аккаунта',()async{
  SharedPreferences.setMockInitialValues({DailyService.cacheKey:jsonEncode({'ownerID':'old','set':{'words':['private']}})});
  final auth=FakeStudyAuth(),service=StudyService.instance;service.configure(auth);
  final state=<String,dynamic>{'today':'2026-09-09','todayActive':true,'current':2,'freezes':2,'asOf':'2026-09-09T10:00:00Z'};
  await service.accept(state,token:'a');
  final prefs=await SharedPreferences.getInstance();
  final daily=jsonDecode(prefs.getString(DailyService.cacheKey)!) as Map;
  expect(daily['ownerID'],'a');expect(daily['set'],isNull);
  final before=service.celebration;
  await service.accept(state,token:'a',userAction:true);await service.accept(state,token:'a',userAction:true);
  expect(service.celebration,before+1);
  auth.switchTo('b');await service.accept(state,token:'a');expect(service.snapshot,isNull);
  auth.switchTo('');
 });
 test('редактор сохраняет альтернативные ответы',(){
  final c=PersonalContent.fromJson({'title':'Тест','kind':'writing','theme':'Общение','text':'Zdravo','rules':['Правило'],'scheme':{'title':'Схема','columns':['Слово'],'rows':[['Zdravo']]},'exercises':[{'kind':'translate','question':'Привет','answer':'Zdravo','acceptedAnswers':['Ćao']}]});
  expect((c.toJson()['exercises'] as List).first['acceptedAnswers'],['Ćao']);
 });
}
