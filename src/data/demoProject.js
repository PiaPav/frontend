// Демо-проект с моковыми данными для демонстрации возможностей системы
export const DEMO_PROJECT = {
  id: 'demo',
  name: 'PIAPAV Demo Project',
  description: 'Демонстрация возможностей анализа архитектуры',
  picture_url: null,
  architecture: {
    requirements: [
      'aio-pika', 'asyncpg', 'bcrypt', 'boto3', 'fastapi',
      'grpcio', 'grpcio-tools', 'pika', 'protobuf', 'pyjwt',
      'python-dotenv', 'python-multipart', 'pyyaml', 'sqlalchemy', 'uvicorn'
    ],
    endpoints: {
      'registration': 'POST /v1/auth/registration',
      'refresh': 'POST /v1/auth/refresh',
      'patch_project': 'PATCH /v1/project/{project_id}',
      'patch_account': 'PATCH /v1/account',
      'login': 'POST /v1/auth/login',
      'homepage': 'GET /v1/home',
      'get_project': 'GET /v1/project/{project_id}',
      'get_projects_list': 'GET /v1/project',
      'get_account': 'GET /v1/account',
      'delete_project': 'DELETE /v1/project/{project_id}',
      'create_project': 'POST /v1/project',
    },
    data: {
      'Account.create_account': ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'],
      'Account.get_account_by_id': ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'],
      'Project.create_project': ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add'],
      'Project.get_project_by_id': ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/DataBaseEntityNotExists'],
      'Project.get_projects_list': ['datamanager/DatabaseManager.session', 'projects/session.execute', 'projects/select', 'projects/Project'],
      'AuthController.login': ['accounts/Account.get_account_by_login', 'accounts/bcrypt.checkpw', 'accounts/pyjwt.encode', 'accounts/datetime'],
      'AuthController.registration': ['accounts/Account.get_account_by_login', 'accounts/bcrypt.hashpw', 'accounts/Account.create_account'],
      'AuthController.refresh': ['accounts/pyjwt.decode', 'accounts/Account.get_account_by_id', 'accounts/datetime'],
      'ProjectController.create_project': ['projects/Project.create_project', 'projects/boto3.client', 'projects/upload_fileobj'],
      'ProjectController.get_project': ['projects/Project.get_project_by_id', 'projects/boto3.client', 'projects/generate_presigned_url'],
      'ProjectController.get_projects': ['projects/Project.get_projects_list'],
      'ProjectController.update_project': ['projects/Project.get_project_by_id', 'projects/session.commit'],
      'ProjectController.delete_project': ['projects/Project.get_project_by_id', 'projects/session.delete', 'projects/boto3.client'],
      'AccountController.get_account': ['accounts/Account.get_account_by_id'],
      'AccountController.update_account': ['accounts/Account.get_account_by_id', 'accounts/session.commit'],
      'router.registration': ['AuthController.registration', 'fastapi/APIRouter.post'],
      'router.login': ['AuthController.login', 'fastapi/APIRouter.post'],
      'router.refresh': ['AuthController.refresh', 'fastapi/APIRouter.post'],
      'router.create_project': ['ProjectController.create_project', 'fastapi/APIRouter.post'],
      'router.get_project': ['ProjectController.get_project', 'fastapi/APIRouter.get'],
      'router.get_projects': ['ProjectController.get_projects', 'fastapi/APIRouter.get'],
      'router.update_project': ['ProjectController.update_project', 'fastapi/APIRouter.patch'],
      'router.delete_project': ['ProjectController.delete_project', 'fastapi/APIRouter.delete'],
      'router.get_account': ['AccountController.get_account', 'fastapi/APIRouter.get'],
      'router.update_account': ['AccountController.update_account', 'fastapi/APIRouter.patch'],
    }
  }
};
