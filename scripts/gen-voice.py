# Озвучка реплик заранее, на этапе подготовки ассетов: в игре только готовые локальные файлы, без микрофона и онлайн-сервисов.
# Нужны: pip install piper-tts, голосовая модель Piper (см. docs/ASSETS) и ffmpeg.
# Запуск: python3 scripts/gen-voice.py /путь/к/ru_RU-irina-medium.onnx
import json, subprocess, sys, os, re
model = sys.argv[1]
src = open('src/content/lines.ts', encoding='utf8').read()
lines = re.findall(r"\{ id: '(\w+)', event: '\w+', ru: '([^']+)'", src)
os.makedirs('public/assets/voice', exist_ok=True)
dur = {}
for lid, text in lines:
    wav = f'/tmp/voice_{lid}.wav'
    subprocess.run([sys.executable, '-m', 'piper', '-m', model, '-f', wav, '--length-scale', '0.92', '--noise-scale', '0.6'], input=text.encode('utf8'), check=True, capture_output=True)
    out = f'public/assets/voice/{lid}.mp3'
    # обрезаем тишину по краям, выравниваем громкость, моно 64 кбит/с
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2,afade=t=in:d=0.01', '-ac', '1', '-ar', '44100', '-b:a', '64k', out], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip())
    dur[lid] = round(d, 2); print(lid, text, d)
json.dump(dur, open('src/content/voiceDurations.json', 'w'), indent=1)
