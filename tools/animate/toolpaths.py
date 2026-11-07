"""Find the external programs the pipeline needs, on macOS, Linux or Windows.

Each tool is looked up in this order:
  1. an environment variable (BLENDER, FFMPEG) holding the full path to the program
  2. the PATH
If neither works, the error says how to install it or point the variable at it.
"""

import os
import shutil
import sys
from pathlib import Path

HINTS = {
    'blender': (
        'BLENDER',
        'Install Blender 5.2 LTS (Windows: winget install -e --id BlenderFoundation.Blender.LTS.5.2; '
        'macOS: brew install --cask blender), then add it to PATH or set BLENDER to the full path, '
        r'for example C:\Program Files\Blender Foundation\Blender 5.2\blender.exe',
    ),
    'ffmpeg': (
        'FFMPEG',
        'Install ffmpeg (Windows: winget install --id Gyan.FFmpeg; macOS: brew install ffmpeg), '
        'then open a new terminal so it is on PATH, or set FFMPEG to the full path of ffmpeg.exe',
    ),
}


class ToolNotFound(RuntimeError):
    pass


def find(name):
    """Return the full path to `name` ('blender' or 'ffmpeg') as a string."""
    env_var, hint = HINTS[name]
    configured = os.environ.get(env_var)
    if configured:
        path = Path(configured).expanduser()
        if path.is_file():
            return str(path)
        raise ToolNotFound(f'{env_var} is set to "{configured}", but no file exists there. {hint}')
    found = shutil.which(name)
    if found:
        return found
    raise ToolNotFound(f'{name} was not found on PATH and {env_var} is not set. {hint}')


if __name__ == '__main__':
    ok = True
    for tool in HINTS:
        try:
            print(f'{tool}: {find(tool)}')
        except ToolNotFound as e:
            ok = False
            print(f'{tool}: MISSING. {e}', file=sys.stderr)
    sys.exit(0 if ok else 1)
