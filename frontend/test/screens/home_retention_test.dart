import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/screens/home_shell.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/auth_service.dart';
import 'package:srbski_read/services/micro_feed_service.dart';

class Probe extends StatefulWidget {
  const Probe({super.key});
  @override
  State<Probe> createState() => ProbeState();
}

class ProbeState extends State<Probe> {
  int value = 0;
  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: () => setState(() => value++), child: Text('value:$value'));
}

void main() {
  testWidgets('вкладка сохраняется между переходами и сменой ширины',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        client: MockClient((_) async => http.Response('{"items":[]}', 200)));
    MicroFeedService.configure(api: api);
    await tester.pumpWidget(ChangeNotifierProvider(
        create: (_) => AuthService(api: api),
        child: MaterialApp(
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(disableAnimations: true),
                child: child!),
            home: const HomeShell(reading: Probe()))));
    await tester.tap(find.text('value:0'));
    await tester.pump();
    await tester.tap(find.text('Вукоток'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Чтение'));
    await tester.pumpAndSettle();
    expect(find.text('value:1'), findsOneWidget);
    await tester.pumpWidget(ChangeNotifierProvider(
        create: (_) => AuthService(api: api),
        child: const MaterialApp(
            home:
                HomeShell(key: ValueKey('другой аккаунт'), reading: Probe()))));
    await tester.pumpAndSettle();
    expect(find.text('value:0'), findsOneWidget);
    await tester.tap(find.text('value:0'));
    await tester.pump();
    await tester.binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpAndSettle();
    expect(find.text('value:1'), findsOneWidget);
  });
}
