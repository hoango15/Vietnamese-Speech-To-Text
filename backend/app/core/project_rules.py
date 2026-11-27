from typing import Literal
from fastapi import HTTPException

ProjectScope=Literal['PERSONAL','TEAM']
ProjectType=Literal['VIDEO','IMAGE','LECTURE','AUDIO']


def owner_roles(scope):
    return ('MEMBER','COMPANY_OWNER','ADMIN') if scope=='PERSONAL' else ('COMPANY_OWNER','ADMIN')


def validate_source(project_type,media_kind):
    allowed={'VIDEO':('ORIGINAL_VIDEO',),'IMAGE':('ORIGINAL_IMAGE',),
             'AUDIO':('ORIGINAL_AUDIO',),'LECTURE':('ORIGINAL_VIDEO','ORIGINAL_AUDIO')}
    if project_type and media_kind not in allowed[project_type]:
        raise HTTPException(422,'Loại tệp nguồn không phù hợp với loại dự án')
