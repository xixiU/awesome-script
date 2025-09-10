import io
import pandas as pd
import argparse
import glob
import os,re
from config import config_explict,config_specialColumns,config_dirPath,config_sep,config_filesuffix,config_output,could_not_be_null
import numpy as np
tableName = dict()
# 加载文件                
def loadFileList() ->list:
    filePathList =glob.glob('%s/*.%s'%(config_dirPath,config_filesuffix))
    assert len(filePathList) >0 
    return filePathList

# 对单个文件进行解析
def getSingleFileData(filePath:str):
    # csv结尾
    if(filePath.endswith('csv')):
        if(config_sep == None):
            filePandas = pd.read_csv(filePath)
        else:
            filePandas = pd.read_csv(filePath,sep=config_sep)
    elif(filePath.endswith('xlsx')):
            print(filePath)
            filePandas = pd.read_excel(filePath)
    else:
        if(config_sep == None):
            filePandas = pd.read_csv(filePath,error_bad_lines=False)
        else:
            filePandas = pd.read_csv(filePath,sep=config_sep,error_bad_lines=False)
    indexItem = filePandas.columns.to_list()
    for deleteItem in config_explict:
        if(deleteItem in indexItem):
            filePandas.drop([deleteItem],inplace=True,axis=1)
    filePandas.dropna(how='all',inplace=True)
    filePandas = filePandas.astype('string')
    return filePandas

# 对单个对象进行组装
def process(dataPd, outputFilePath):
    # fileList = loadFileList()
    # for singleFilePath in fileList:
    #     df = getSingleFileData(singleFilePath)
    all_line = [] 
    tableName = outputFilePath.split('.')[0]
    config_include = dataPd.columns.to_list()
    for _index, row in dataPd.iterrows():
        result = 'INSERT INTO  %s('%tableName
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
                if pd.isna(row[column]):
                    result += 'null,'
                    continue
                row[column] = row[column].replace("'",r"\'")
                if row[column].startswith('\'') and row[column].endswith('\''):
                        result += row[column]
                else:
                    result = result + "'"+ row[column] +"'"
            result +=' ,'
        if config_include[-1] not in could_not_be_null and pd.isna(row[config_include[-1]]):
            print("%d %s could not be null"%(_index, config_include[-1]))
        elif pd.isna(row[config_include[-1]]):
            result += 'null,'
        elif row[config_include[-1]].startswith('\'') and row[config_include[-1]].endswith('\''):
            result += row[config_include[-1]]
        else:
            result = result + "'"+ row[config_include[-1]] +"'"
        result +=') ;'
        all_line.append(result)
        
    with open(os.path.join(config_output, tableName+'.sql'),'w',encoding='utf-8') as f_w:
        f_w.writelines(map(lambda x: x + os.linesep, all_line))
    print("%s 处理完成"%outputFilePath)


if __name__ == "__main__":
    if(not os.path.exists(config_output)):
        os.makedirs(config_output)
    filePathList = loadFileList()
    for filePath in filePathList:
        dataPd = getSingleFileData(filePath)
        #filename = filePath.split(os.sep)[-1].split('.')[0]
        process(dataPd,filePath.split(os.sep)[-1])
