import subprocess, time
p = subprocess.Popen([r'C:\Users\yasha\AppData\Roaming\com.nyx.desktop\binaries\llama-server-vulkan.exe'])
time.sleep(1)
cmd = r"Expand-Archive -Path 'C:\Users\yasha\AppData\Roaming\com.nyx.desktop\binaries\llama_vulkan.zip' -DestinationPath 'C:\Users\yasha\AppData\Roaming\com.nyx.desktop\binaries' -Force"
res = subprocess.run(['powershell', '-c', cmd], capture_output=True, text=True)
p.kill()
print('STDOUT:', res.stdout)
print('STDERR:', res.stderr)
