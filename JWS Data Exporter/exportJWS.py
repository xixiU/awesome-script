#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
@File    :   Untitled-1
@Date    :   2024/10/15 10:39:34
@Author  :   yuan 
@Desc    :   jws数据导出python
'''

import pandas as pd
import json

with open('./example.json', encoding='utf-8') as fh:
    data = json.load(fh)


data_pd = pd.DataFrame(data['data']['data'])
print(data_pd)
data_pd.to_excel("order_content.xlsx", index=False)
