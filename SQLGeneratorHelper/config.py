# 如果需要对应的参数，取消注释对应的参数即可
config_dirPath = './'

# 生成sql文本的保存位置，
config_output = 'output'

# set Separator 设置分隔符 设置分隔符 
config_sep = ','


# set suffix 设置文件后缀 如filesuffix = 'txt'
config_filesuffix = 'xlsx'

# 需要生成的字段列表 如include = [region ,is_delete]
#id,gmt_create,gmt_modified,code,name,type,scope,effective_from,effective_to,own_sign,region_sign,is_delete,db_remark,order_no,tax_type,scope_type,fetch_condition,source_condition,data_source
config_include = [ 'gmt_create']#'code', 'name','type','scope','scope_type','fetch_condition'

# 通用字段
config_common_include = ['gmt_create', 'gmt_modified', 'own_sign', 'region_sign', 'is_delete']

# 需要生成的字段列表 如include = [region ,is_delete]
config_include = list(set(config_common_include + config_include))

# 需要排除的字段列表 如explict = [id]
config_explict = ['id','operator_no' ,'operator_name']

# 不能为空的段值
could_not_be_null = []

# 特殊字段格式,如 specialColumns = {'is_delete':{'TYPE':'TEXT','VALUE':'N'}}
# TEXT表示本文字段，FUNC表示函数，目前只支持文本型函数替换
config_specialColumns = {'is_delete':{'TYPE':'TEXT','VALUE':'N'},'region_sign':{'TYPE':'TEXT','VALUE':'hz'},'period':{'TYPE':'TEXT','VALUE':'202013'},'gmt_modified':{'TYPE':'FUNC','VALUE':'now()'},'gmt_create':{'TYPE':'FUNC','VALUE':'now()'},'own_sign':{'TYPE':'TEXT','VALUE':'staging'}}
#,"scope_type":{'TYPE':'TEXT','VALUE':'BU'},'fetch_condition':{'TYPE':'TEXT','VALUE':'{"coaId":"50288L"}'}
# 文件类型insert sql类型
import_mode = 'sql'