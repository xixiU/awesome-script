import io
import pandas as pd
import argparse
import glob
import os,re
from config import config_include,config_explict,config_specialColumns,config_dirPath,config_sep,config_filesuffix,config_output,import_mode
import numpy as np
tableName = dict()
# 加载文件                
def loadFileList() ->list:
    filePathList =glob.glob('%s/*.%s'%(config_dirPath,config_filesuffix))
    assert len(filePathList) >0 
    return filePathList

# 对单个文件进行解析
def getSingleFileData(filePath:str):
    if import_mode!='sql':
        # csv结尾
        if(filePath.endswith('csv')):
            if(config_sep == None):
                filePandas = pd.read_csv(filePath)
            else:
                filePandas = pd.read_csv(filePath,sep=config_sep)
        elif(filePath.endswith('xlsx')):
                filePandas = pd.read_excel(filePath)
        else:
            if(config_sep == None):
                filePandas = pd.read_csv(filePath,error_bad_lines=False)
            else:
                filePandas = pd.read_csv(filePath,sep=config_sep,error_bad_lines=False)
        indexItem = filePandas.index.to_list()
        for deleteItem in config_explict:
            if(deleteItem in indexItem):
                filePandas.drop(deleteItem,inplace=True)
        # table_name[] = filePath.split(os.sep)[-1].split()[0]
    else:
        with open(filePath,'r') as f_r:
            for line in f_r.readlines():
                obj = re.search(r"INSERT INTO `(.*)` (.*);",line,re.M|re.I)
                sql_list = []
                if searchObj:
                    # table_name[filePath] = obj.group(1)
                    realContent = obj.group(2).replace('(','').replace(')','').replace('`','')
                    keyContent = re.search(r"(.*) VALUES (.*)",realContent,re.M|re.I)
                    columns = keyContent.group(1)
                    content = keyContent.group(2)
                    sql_list.append(np.array(content))
                pd.read_csv(io.StringIO(realContent.replace('`','')),encoding='utf8', sep=",",)


    return filePandas

# 对单个对象进行组装
def process(dataPd, outputFilePath):
    # fileList = loadFileList()
    # for singleFilePath in fileList:
    #     df = getSingleFileData(singleFilePath)
    all_line = [] 
    for index, row in dataPd.iterrows():
        if outputFilePath not in tableName.keys():
            result = 'INSERT INTO  %s('%tableName.split(os.sep)[-1].split('.')[0]
        else:
            result = 'INSERT INTO  %s('%tableName[outputFilePath]
        # 添加columns 
        result += ', '.join(config_include)
        result +=') values('
        for column in config_include[:-1]:
            # 特殊列处理
            if(column in config_specialColumns):
                if(config_specialColumns[column]['TYPE'] == 'TEXT'):
                    if config_specialColumns[column]['VALUE'].startswith('\'') and config_specialColumns[column]['VALUE'].endswith('\''):
                        result += config_specialColumns[column]['VALUE'] 
                    else:
                        result = result + "'"+ config_specialColumns[column]['VALUE'] +"'"
                else:
                    result += config_specialColumns[column]['VALUE']
            else:
                if row[column].startswith('\'') and row[column].endswith('\''):
                        result += row[column]
                else:
                    result = result + "'"+ row[column] +"'"
            result +=' ,'
        
        if row[config_include[-1]].startswith('\'') and row[config_include[-1]].endswith('\''):
            result += row[config_include[-1]]
        else:
            result = result + "'"+ row[config_include[-1]] +"'"
        result +=') ;'
        all_line.append(result)
        
    with open(os.path.join(config_output, outputFilePath),'w',encoding='utf-8') as f_w:
        f_w.writelines(map(lambda x: x + os.linesep, all_line))
    print("%s 处理完成"%outputFilePath)


if __name__ == "__main__":
    if(not os.path.exists(config_output)):
        os.makedirs(config_output)
    filePathList = loadFileList()
    for filePath in filePathList:
        dataPd = getSingleFileData(filePath)
        #filename = filePath.split(os.sep)[-1].split('.')[0]
        process(dataPd,filePath)
