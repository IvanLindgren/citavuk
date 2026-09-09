import 'package:flutter/material.dart';
import '../models/course.dart';

Future<Lesson?> showCourseEntryPicker(BuildContext context, Course course) =>
    showModalBottomSheet<Lesson>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _CourseEntryPicker(course: course),
    );

class _CourseEntryPicker extends StatefulWidget {
  const _CourseEntryPicker({required this.course});
  final Course course;
  @override
  State<_CourseEntryPicker> createState() => _CourseEntryPickerState();
}

class _CourseEntryPickerState extends State<_CourseEntryPicker> {
  String _query = '';
  @override
  Widget build(BuildContext context) {
    final lessons = widget.course.allLessons
        .where((l) =>
            ('${l.title} ${widget.course.skillOfLesson(l.id)?.title ?? ''}')
                .toLowerCase()
                .contains(_query.trim().toLowerCase()))
        .toList();
    return SizedBox(
        height: MediaQuery.sizeOf(context).height * .8,
        child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('С какого урока начнём?',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 12),
              const Text(
                  'Выбери знакомую ступень. Предыдущие темы можно будет пройти позже.'),
              const SizedBox(height: 16),
              TextField(
                  autofocus: true,
                  decoration: const InputDecoration(
                      labelText: 'Найти тему или урок',
                      prefixIcon: Icon(Icons.search)),
                  onChanged: (v) => setState(() => _query = v)),
              const SizedBox(height: 12),
              Expanded(
                  child: lessons.isEmpty
                      ? const Center(
                          child: Text(
                              'Ничего не найдено. Попробуй другое название.'))
                      : ListView.builder(
                          itemCount: lessons.length,
                          itemBuilder: (context, i) {
                            final l = lessons[i];
                            return ListTile(
                                title: Text(l.title),
                                subtitle: Text(
                                    widget.course.skillOfLesson(l.id)?.title ??
                                        ''),
                                trailing: const Icon(Icons.arrow_forward),
                                onTap: () => Navigator.pop(context, l));
                          })),
            ])));
  }
}
