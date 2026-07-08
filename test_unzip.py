import subprocess
import os

zip_str = r"C:\Users\yasha\AppData\Roaming\com.nyx.desktop\binaries\llama_vulkan.zip"
bin_str = r"C:\Users\yasha\AppData\Roaming\com.nyx.desktop\binaries"

# 1. Download
import urllib.request
url = "https://github.com/ggerganov/llama.cpp/releases/download/b9776/llama-b9776-bin-win-vulkan-x64.zip"
urllib.request.urlretrieve(url, zip_str)

print("File downloaded. Exists:", os.path.exists(zip_str), "Size:", os.path.getsize(zip_str))

# 2. Run PowerShell
cmd = f"Expand-Archive -Path '{zip_str}' -DestinationPath '{bin_str}' -Force"
print("Running command:", cmd)
result = subprocess.run(["powershell", "-c", cmd], capture_output=True, text=True)

print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)
print("Return code:", result.returncode)
