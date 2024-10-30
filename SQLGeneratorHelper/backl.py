import pandas as pd
import argparse
import glob
parser = argparse.ArgumentParser(description='SQLGeneratorHelper')
parser.add_argument('--dirPath', '-d',type=str,default='./',
                    help='set dirctory path 设置文件路径,默认程序当前路径')
parser.add_argument('--sep', '-s', type = str,
                    help='set Separator 设置分隔符')
parser.add_argument('--filesuffix', '-s', type = str,
                    help='set suffix 设置文件后缀')
parser.add_argument('--include', nargs='+',
                    help='需要生成的字段列表') 
parser.add_argument('--explict', nargs='+',
                    help='需要排除的字段列表') 
parser.add_argument('--specialColumns', '-s', type = str,
                    help='特殊字段格式')                   

args = parser.parse_args()  
# 加载文件                
def loadFileList() ->list:
    filePathList =glob.glob('%s/*.%s'%(args.dirpath,args.sep))
    assert len(filePathList) >0 
    return filePathList

# 对单个文件进行解析
def getSingleFileData(filePath:str):
    # csv结尾
    if(filePath.endswith('csv')):
        if(args.sep == None):
            filePandas = pd.read_csv(filePath)
        elif():
            filePandas = pd.read_csv(filePath,sep=args.sep)
    elif(filePath.endswith('xlsx')):
        if(args.sep == None):
            filePandas = pd.read_excel(filePath)
        elif():
            filePandas = pd.read_excel(filePath,sep=args.sep)
    else:
        if(args.sep == None):
            filePandas = pd.read_csv(filePath)
        elif():
            filePandas = pd.read_csv(filePath,sep=args.sep)

# 对单个对象进行组装
def process(pandas:pd):
    
    for index, row in df.iterrows():
        result = 'INSERT INTO  ata_dictionary('
        



if __name__ == "__main__":
    filePathList = loadFileList()
    for filePath in filePathList:
        pass