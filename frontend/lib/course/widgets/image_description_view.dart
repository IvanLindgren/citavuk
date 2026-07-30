/// Описание изображения (master-prompt §6.4).
///
/// Изображение — учебное содержание, а не декорация, поэтому у него есть
/// alt text для скринридера и явное состояние ошибки загрузки.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import 'choice_view.dart';
import 'course_chip.dart';

class ImageDescriptionView extends StatefulWidget {
  const ImageDescriptionView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final ImageDescriptionExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  @override
  State<ImageDescriptionView> createState() => _ImageDescriptionViewState();
}

class _ImageDescriptionViewState extends State<ImageDescriptionView> {
  late final TextEditingController _controller = TextEditingController(
    text: (widget.answer as TextAnswer?)?.text ?? '',
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.exercise;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ExerciseImage(image: e.image),
        const SizedBox(height: 16),
        switch (e.mode) {
          ImageMode.choose => ChoiceView(
              options: e.options,
              multi: false,
              shuffleSeed: e.id,
              answer: widget.answer,
              enabled: widget.enabled,
              onChanged: widget.onChanged,
            ),
          ImageMode.free => _FreeTextField(
              controller: _controller,
              enabled: widget.enabled,
              onChanged: (text) => widget.onChanged(
                text.trim().isEmpty ? null : TextAnswer(text),
              ),
            ),
          // Режимы build/fill требуют полей tokens/blanks, которых схема v1
          // у image_description не описывает. Валидатор не пропускает такие
          // упражнения в bundle, так что сюда попасть нельзя.
          ImageMode.build || ImageMode.fill => _UnsupportedMode(mode: e.mode),
        },
      ],
    );
  }
}

class _ExerciseImage extends StatelessWidget {
  const _ExerciseImage({required this.image});

  final ImageAsset image;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      image: true,
      label: image.altText.isEmpty ? 'Изображение задания' : image.altText,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: AspectRatio(
          aspectRatio: 4 / 3,
          child: Container(
            color: scheme.surfaceContainerHighest,
            child: Image.asset(
              image.path,
              fit: BoxFit.cover,
              alignment: Alignment(image.focalX * 2 - 1, image.focalY * 2 - 1),
              errorBuilder: (context, error, stack) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.image_not_supported_outlined,
                        size: 32,
                        color: scheme.onSurface.withValues(alpha: 0.5)),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        image.altText.isEmpty
                            ? 'Изображение недоступно'
                            : image.altText,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: scheme.onSurface.withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FreeTextField extends StatelessWidget {
  const _FreeTextField({
    required this.controller,
    required this.enabled,
    required this.onChanged,
  });

  final TextEditingController controller;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ExerciseSectionLabel('ВАШЕ ОПИСАНИЕ'),
        TextField(
          controller: controller,
          enabled: enabled,
          onChanged: onChanged,
          maxLines: 3,
          minLines: 2,
          style: const TextStyle(fontSize: 17),
          decoration: InputDecoration(
            hintText: 'Опишите изображение по-сербски',
            filled: true,
            fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide:
                  BorderSide(color: scheme.primary.withValues(alpha: 0.4)),
            ),
          ),
        ),
      ],
    );
  }
}

class _UnsupportedMode extends StatelessWidget {
  const _UnsupportedMode({required this.mode});

  final ImageMode mode;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.construction, color: scheme.error),
          const SizedBox(width: 12),
          Expanded(
            child: Text('Режим «${mode.name}» пока не поддерживается.'),
          ),
        ],
      ),
    );
  }
}
