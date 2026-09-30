import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/auth_service.dart';

void main() {
  test('роль администратора сохраняется при смене уровня и кешировании', () {
    final account = Account.fromJson({
      'id': 'admin',
      'email': 'admin@example.test',
      'displayName': 'Админ',
      'isAdmin': true
    });
    expect(account.withLevel('B1').isAdmin, isTrue);
    expect(Account.fromJson(account.toJson()).isAdmin, isTrue);
    expect(
        Account.fromJson({'id': 'reader', 'isAdmin': 'true'}).isAdmin, isFalse);
    expect(Account.fromJson({'id': 'reader'}).isAdmin, isFalse);
  });
}
