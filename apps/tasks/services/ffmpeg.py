import os
import subprocess

output_dir = "./assets/outputs"
input_video = "./assets/video.mp4"
output_audio = "./assets/outputs/audio.wav"

def validate_prerequisite():
    os.makedirs(output_dir, exist_ok=True)

def convert_to_audio(video_path):
    command = [
        "ffmpeg", 
        "-i", input_video,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        output_audio
    ]
    validate_prerequisite()
    subprocess.run(command, check=True)
