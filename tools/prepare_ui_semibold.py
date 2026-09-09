"""Статическое начертание UI для Windows; оригинальные шрифты чтения не меняет."""
import argparse
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
font=TTFont(args.source)
instantiateVariableFont(font,{'wght':600,'wdth':100},inplace=True)
options=subset.Options()
options.name_IDs=['*']
subsetter=subset.Subsetter(options=options)
subsetter.populate(unicodes=subset.parse_unicodes('0000-052F,1E00-1FFF,2000-206F,20A0-20CF,2100-214F,2190-21FF,2500-27BF'))
subsetter.subset(font)
assert 'fvar' not in font
for base,suffix,flavor in [('frontend/assets/fonts','ttf',None),('web/public/fonts','woff2','woff2')]:
    target=root/base/f'NotoSans-SemiBold.{suffix}'
    font.flavor=flavor
    font.save(target)
    print(f'{target}: {target.stat().st_size} bytes')
