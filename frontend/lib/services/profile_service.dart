import '../models/profile_stats.dart';
import 'api_client.dart';

class ProfileService {
  const ProfileService({required this.api});

  final ApiClient api;

  Future<ProfileStats> stats() async {
    final response = await api.get('/v1/profile/stats');
    return ProfileStats.fromJson((response as Map).cast<String, dynamic>());
  }
}
