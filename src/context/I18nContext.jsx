import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const translations = {
  en: {
    'common.loading': 'Loading...',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.saveChanges': 'Save changes',
    'common.reset': 'Reset',
    'common.delete': 'Delete',
    'common.deleteProject': 'Delete project',
    'common.deleteAccount': 'Delete account',
    'common.view': 'View',
    'common.create': 'Create',
    'common.settings': 'Settings',
    'common.logout': 'Log out',
    'common.language': 'Language',
    'common.lang.ru': 'Russian',
    'common.lang.en': 'English',

    'auth.login.title': 'Log in',
    'auth.login.loginLabel': 'Login',
    'auth.login.passwordLabel': 'Password',
    'auth.login.loginPlaceholder': 'Enter login',
    'auth.login.passwordPlaceholder': 'Enter password',
    'auth.login.showPassword': 'Show',
    'auth.login.hidePassword': 'Hide',
    'auth.login.submit': 'Log in',
    'auth.login.submitting': 'Signing in...',
    'auth.login.error.missing': 'Fill in all fields',
    'auth.login.error.failed': 'Could not sign in. Please try again.',
    'auth.login.noAccount': 'No account?',
    'auth.login.create': 'Create',
    'auth.error.network': 'Server connection error. Check backend CORS settings.',
    'auth.error.invalidLogin': 'Invalid login',
    'auth.error.invalidPassword': 'Invalid password',
    'auth.error.loginFailed': 'Could not sign in.',
    'auth.error.registerNetwork': 'Network error. Check your connection.',
    'auth.error.cors': 'CORS error. Configure CORS on the backend.',
    'auth.error.registerFailed': 'Could not sign up.',

    'auth.register.title': 'Sign up',
    'auth.register.nameLabel': 'Name',
    'auth.register.surnameLabel': 'Surname',
    'auth.register.loginLabel': 'Login',
    'auth.register.passwordLabel': 'Password',
    'auth.register.confirmLabel': 'Confirm password',
    'auth.register.namePlaceholder': 'Enter name',
    'auth.register.surnamePlaceholder': 'Enter surname',
    'auth.register.loginPlaceholder': 'Enter login',
    'auth.register.passwordPlaceholder': 'At least 8 characters',
    'auth.register.confirmPlaceholder': 'Repeat password',
    'auth.register.showPassword': 'Show',
    'auth.register.hidePassword': 'Hide',
    'auth.register.showConfirm': 'Show',
    'auth.register.hideConfirm': 'Hide',
    'auth.register.submit': 'Sign up',
    'auth.register.submitting': 'Signing up...',
    'auth.register.error.missing': 'Fill in all fields',
    'auth.register.error.shortPassword': 'Password must be at least 8 characters',
    'auth.register.error.mismatch': 'Passwords do not match',
    'auth.register.haveAccount': 'Already have an account?',
    'auth.register.login': 'Log in',

    'projects.list.loading': 'Loading projects...',
    'projects.list.create': 'Create',
    'projects.list.title': 'Projects',
    'projects.list.settings': 'Settings',
    'projects.list.logout': 'Log out',
    'projects.list.error.load': 'Failed to load projects',
    'projects.list.emptyTitle': 'No projects found',
    'projects.list.emptySubtitle': 'Create a new project to get started.',
    'projects.list.view': 'View',
    'projects.list.delete': 'Delete',
    'projects.list.deleting': 'Deleting...',
    'projects.list.confirmDelete': 'Delete project? This action cannot be undone.',
    'projects.list.error.notFound': 'Project not found or no access.',
    'projects.list.error.invalidToken': 'Invalid token.',
    'projects.list.error.deleteFailed': 'Could not delete the project. Please try again.',
    'projects.list.userPlaceholder': 'User',
    'projects.list.userPlaceholderLetter': 'U',
    'projects.list.userPlaceholderName': 'User',

    'projects.new.title': 'Create a new project',
    'projects.new.nameLabel': 'Project name',
    'projects.new.namePlaceholder': 'Enter a name',
    'projects.new.descriptionLabel': 'Description',
    'projects.new.descriptionPlaceholder': 'Describe your project',
    'projects.new.fileLabel': 'Architecture / file *',
    'projects.new.fileTitleSelected': 'File selected',
    'projects.new.fileTitle': 'Upload project (ZIP)',
    'projects.new.fileHintSelected': '{{name}} • {{size}}',
    'projects.new.fileHint': 'Drag archive here or click to choose',
    'projects.new.fileBadge': 'ZIP',
    'projects.new.fileNote': 'Upload a ZIP archive (required)',
    'projects.new.error.nameRequired': 'Enter a project name',
    'projects.new.error.fileRequired': 'You must choose a ZIP file',
    'projects.new.error.analysis': 'Project analysis error',
    'projects.new.error.create': 'Failed to create project',
    'projects.new.error.fileProcessing': 'File processing error on server. Contact administrator.',
    'projects.new.analysis.creating': 'Creating project...',
    'projects.new.analysis.analyzing': 'Analyzing project in real time...',
    'projects.new.analysis.completed': 'Analysis completed!',
    'projects.new.actions.cancel': 'Cancel',
    'projects.new.actions.submit': 'Create',
    'projects.new.actions.submitting': 'Creating...',
    'projects.new.building': 'Building graph...',
    'projects.new.built': 'Build complete',
    'projects.new.premium.title': 'Premium required',
    'projects.new.premium.description': 'File exceeds 50 MB. Purchase Premium to upload larger projects.',
    'projects.new.premium.buy': 'Buy Premium',
    'projects.new.premium.continueWithout': 'Continue without file',

    'graph.nodes': 'Nodes',
    'graph.edges': 'Edges',
    'graph.requirements': 'Dependencies',
    'graph.endpoints': 'Endpoints',
    'graph.rendering': 'Rendering...',
    'graph.rendered': 'Rendering finished',
    'graph.meta': 'Nodes: {{nodes}} | Edges: {{edges}} | Requirements: {{requirements}} | Endpoints: {{endpoints}}',
    'graph.title': 'Project Architecture',
    'graph.actions.more': 'Open menu',
    'graph.actions.title': 'Actions',
    'graph.actions.delete': 'Delete',

    'analysis.renderDone': 'Rendering finished',
    'analysis.renderInProgress': 'Rendering, please wait',
    'analysis.loadingData': 'Please wait. Loading data...',
    'analysis.reload': 'Reload page',
    'analysis.preparingTitle': 'Preparing architecture visualization...',
    'analysis.preparingSubtitle': 'Connecting and preparing data. Usually takes a few seconds.',
    'analysis.buildingGraph': 'Please wait. Building graph...',
    'analysis.dependencies': 'Dependencies',
    'analysis.dependenciesEmpty': 'Dependencies will appear once received.',
    'analysis.waitingStream': 'Waiting for stream...',
    'analysis.noDependencies': 'No dependencies found',
    'analysis.expandDependencies': 'Expand dependencies',
    'analysis.collapseDependencies': 'Collapse dependencies',

    'analysis.error.unknown': 'Unknown connection error',
    'analysis.error.notFound': 'Project not found (404).',
    'analysis.error.backend': 'Server infrastructure error (502/503).',
    'analysis.error.connect': 'Could not connect to the server.',
    'analysis.error.generic': 'Failed to load project data',
    'analysis.error.label': 'Error',
    'analysis.delete.confirm': 'Delete project? You will not be able to restore it.',
    'analysis.delete.notFound': 'Project not found or already deleted.',
    'analysis.delete.unauthorized': 'Session expired. Please sign in again.',
    'analysis.delete.failed': 'Could not delete project. Try again later.',
    'analysis.delete.deleting': 'Deleting...',
    'analysis.delete.delete': 'Delete project',

    'settings.title': 'Account settings',
    'settings.back': '← Back',
    'settings.profile': 'Profile',
    'settings.loginLabel': 'Login',
    'settings.loginPlaceholder': 'Your login',
    'settings.loginHint': 'Login cannot be changed',
    'settings.nameLabel': 'Name',
    'settings.surnameLabel': 'Surname',
    'settings.namePlaceholder': 'Your name',
    'settings.surnamePlaceholder': 'Your surname',
    'settings.saveProfile': 'Save changes',
    'settings.saveProfileLoading': 'Saving...',
    'settings.resetProfile': 'Reset',
    'settings.profileError': 'Fill in first and last name',
    'settings.profileSuccess': 'Profile updated',
    'settings.profileUpdateError': 'Could not update profile',
    'settings.profileDeleteError': 'Could not delete account',

    'settings.email': 'Email',
    'settings.currentEmail': 'Current email:',
    'settings.emailVerified': 'Email verified',
    'settings.unlinkEmail': 'Unlink email',
    'settings.unlinkingEmail': 'Unlinking...',
    'settings.enterEmail': 'Enter email',
    'settings.linkEmail': 'Link email',
    'settings.linkingEmail': 'Sending code...',
    'settings.verificationPrompt': 'Enter the verification code from the email:',
    'settings.verificationPlaceholder': 'Verification code',
    'settings.verify': 'Verify',
    'settings.cancel': 'Cancel',
    'settings.unlinkConfirm': 'Unlink email?',
    'settings.unlinkError': 'Could not unlink email',
    'settings.linkError': 'Could not link email',
    'settings.codeSent': 'Code sent to {{email}}',
    'settings.codeSentCurrent': 'Code sent to current email',
    'settings.invalidCode': 'Invalid verification code',
    'settings.emailAlreadyLinked': 'Email already linked',
    'settings.emailExists': 'Email already in use',
    'settings.emailNotLinked': 'Email is not linked',
    'settings.emailSendFailed': 'Could not send email. Try again later.',
    'settings.emailRequired': 'Enter email',
    'settings.codeRequired': 'Enter verification code',
    'settings.emailLinked': 'Email verified!',
    'settings.emailUnlinked': 'Email unlink confirmed!',
    'settings.profileLoadError': 'Could not load profile',

    'settings.delete.title': 'Delete account',
    'settings.delete.warning': 'This action is irreversible. All data will be removed.',
    'settings.delete.open': 'Delete account',
    'settings.delete.confirmTitle': 'Confirm deletion',
    'settings.delete.promptText': 'To delete the account, type',
    'settings.delete.phrase': 'delete my account {{login}}',
    'settings.delete.placeholder': 'delete my account {login}',
    'settings.delete.exact': 'Enter the exact confirmation phrase',
    'settings.delete.deleting': 'Deleting...',

    'settings.language.title': 'Language',
    'settings.language.subtitle': 'Choose interface language (default Russian)',
  },
};

const I18nContext = createContext({
  language: 'ru',
  setLanguage: () => {},
  t: (key, fallback) => fallback ?? key,
  availableLanguages: ['ru', 'en'],
});

function interpolate(template, values) {
  if (!values) return template;
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(values, trimmed) ? values[trimmed] : '';
  });
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const stored = localStorage.getItem('app_language');
    return stored || 'ru';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key, fallback, values) => {
      const fromLang = translations[language]?.[key];
      const fromRu = translations.ru?.[key];
      const template = fromLang ?? fromRu ?? fallback ?? key;
      return interpolate(template, values);
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      availableLanguages: ['ru', 'en'],
    }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
