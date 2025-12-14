import { useState } from 'react';
import styles from './Landing.module.css';
import { Link, useNavigate } from 'react-router-dom';
import logoImage from '../../assets/img/logo/deep-learning.png';
import { useI18n } from '../../context/I18nContext';

const translations = {
    ru: {
        nav: {
            howItWorks: 'Как это работает',
            faq: 'FAQ',
            login: 'Вход',
            register: 'Регистрация',
        },
        heroTitleMain: 'Визуализируйте архитектуру',
        heroTitleAccent: 'в один',
        heroTitleClick: 'клик',
        heroDescription: 'Интерактивные диаграммы из вашего кода. PIAPAV анализирует модули, выявляет зависимости между слоями и помогает выявить риски мгновенно.',
        ctaPrimary: 'Попробовать бесплатно',
        scrollDown: 'Прокрутить вниз',
        howItWorksTitle: 'Как это работает',
        howItWorksSubtitle: 'Четыре простых шага до полного понимания вашей архитектуры',
        howItWorksSteps: [
            {
                icon: '📤',
                title: 'Загрузите проект',
                description: 'Просто загрузите архив с вашим кодом',
            },
            {
                icon: '🔍',
                title: 'Анализ кода в реальном времени',
                description: 'Система парсит зависимости, эндпоинты и строит граф вызовов в реальном времени',
            },
            {
                icon: '⚡',
                title: 'Анализируйте',
                description: 'Находите узкие места, понимайте связи и принимайте решения на основе данных',
            },
        ],
        techLabel: 'Технологии:',
        faqTitle: 'Часто задаваемые вопросы',
        faqSubtitle: 'Всё, что вам нужно знать о PIAPAV',
        faqs: [
            {
                question: 'Какие языки программирования поддерживаются?',
                answer: 'В текущей версии мы поддерживаем Python проекты (FastAPI, Django, Flask). В ближайших обновлениях добавим JavaScript/TypeScript, Go и другие популярные языки.',
            },
            {
                question: 'Как PIAPAV анализирует мой код?',
                answer: 'Мы используем статический анализ AST (Abstract Syntax Tree) для построения графа зависимостей. Ваш код не выполняется, анализируется только структура.',
            },
            {
                question: 'Безопасно ли загружать код?',
                answer: 'Абсолютно! Весь код хранится в зашифрованном виде в S3-совместимом хранилище. Анализ происходит в изолированной среде. Мы не имеем доступа к вашему коду.',
            },
            {
                question: 'Можно ли экспортировать результаты?',
                answer: 'Да! Вы можете сохранить архитектуру проекта в базе данных и вернуться к ней в любое время. Функции экспорта в PNG/SVG будут добавлены в следующем обновлении.',
            },
            {
                question: 'Есть ли ограничения по размеру проекта?',
                answer: 'Для бесплатного аккаунта ограничение составляет 50 МБ на проект. Premium пользователи могут загружать проекты до 500 МБ.',
            },
            {
                question: 'Как работает real-time анализ?',
                answer: 'Мы используем gRPC streaming для передачи данных по мере их обработки. Вы видите прогресс анализа в реальном времени: зависимости → эндпоинты → граф вызовов.',
            },
        ],
        ctaTitle: 'Готовы увидеть свою архитектуру?',
        ctaSubtitle: 'Начните анализировать проекты бесплатно уже сегодня',
        ctaButton: 'Начать сейчас',
        footerText: 'Визуализация архитектуры проектов.',
        modalTitle: 'Пробная версия',
        modalWarning: 'Без регистрации можно создать только один проект',
        modalCreateProject: 'Создать проект',
        modalRegister: 'Зарегистрироваться',
        langLabel: 'Язык',
        switchLabel: 'Выберите язык',
    },
    en: {
        nav: {
            howItWorks: 'How it works',
            faq: 'FAQ',
            login: 'Log in',
            register: 'Sign up',
        },
        heroTitleMain: 'Visualize your architecture',
        heroTitleAccent: 'in one',
        heroTitleClick: 'click',
        heroDescription: 'Interactive diagrams straight from your code. PIAPAV analyzes modules, uncovers cross-layer dependencies, and helps you spot risks instantly.',
        ctaPrimary: 'Try for free',
        scrollDown: 'Scroll down',
        howItWorksTitle: 'How it works',
        howItWorksSubtitle: 'Four simple steps to fully understand your architecture',
        howItWorksSteps: [
            {
                icon: '📤',
                title: 'Upload a project',
                description: 'Just upload an archive with your code',
            },
            {
                icon: '🔍',
                title: 'Live code analysis',
                description: 'The system parses dependencies, endpoints, and builds a call graph in real time',
            },
            {
                icon: '⚡',
                title: 'Analyze',
                description: 'Find bottlenecks, understand relationships, and make data-driven decisions',
            },
        ],
        techLabel: 'Tech stack:',
        faqTitle: 'Frequently asked questions',
        faqSubtitle: 'Everything you need to know about PIAPAV',
        faqs: [
            {
                question: 'Which programming languages are supported?',
                answer: 'We currently support Python projects (FastAPI, Django, Flask). JavaScript/TypeScript, Go, and other languages are coming soon.',
            },
            {
                question: 'How does PIAPAV analyze my code?',
                answer: 'We use static AST analysis to build the dependency graph. Your code is never executed—only the structure is inspected.',
            },
            {
                question: 'Is it safe to upload my code?',
                answer: 'Absolutely. Your code is stored encrypted in S3-compatible storage. Analysis runs in an isolated environment. We do not access your code.',
            },
            {
                question: 'Can I export the results?',
                answer: 'Yes. You can save the project architecture in the database and return to it anytime. Export to PNG/SVG will be added in the next release.',
            },
            {
                question: 'Are there project size limits?',
                answer: 'Free accounts are limited to 50 MB per project. Premium users can upload projects up to 500 MB.',
            },
            {
                question: 'How does the real-time analysis work?',
                answer: 'We use gRPC streaming to send data as it is processed. You see live progress: dependencies → endpoints → call graph.',
            },
        ],
        ctaTitle: 'Ready to see your architecture?',
        ctaSubtitle: 'Start analyzing projects for free today',
        ctaButton: 'Start now',
        footerText: 'Project architecture visualization.',
        modalTitle: 'Trial version',
        modalWarning: 'Without sign up you can create only one project',
        modalCreateProject: 'Create project',
        modalRegister: 'Sign up',
        langLabel: 'Language',
        switchLabel: 'Select language',
    },
};

export default function Landing() {
    const [activeFaq, setActiveFaq] = useState(null);
    const [showTrialModal, setShowTrialModal] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const { language: lang, setLanguage } = useI18n();

    const t = translations[lang];
    const howItWorksSteps = t.howItWorksSteps;
    const faqs = t.faqs;

    const scrollToSection = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    const renderLanguageSwitcher = (className = '') => (
        <div className={`${styles.langSwitch} ${className}`} role="group" aria-label={t.switchLabel}>
            {['ru', 'en'].map((code) => (
                <button
                    key={code}
                    className={`${styles.langBtn} ${lang === code ? styles.langBtnActive : ''}`}
                    onClick={() => setLanguage(code)}
                    disabled={lang === code}
                    aria-pressed={lang === code}
                >
                    {code.toUpperCase()}
                </button>
            ))}
        </div>
    );

    return (
        <div className={styles.container}>
            {/* Hero Section */}
            <div className={styles.heroSection}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <img src={logoImage} alt="PIAPAV logo" />
                        <span>PIAPAV</span>
                    </div>
                    
                    <button 
                        className={styles.burgerBtn}
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label="Menu"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>

                    <div className={styles.centerNav}>
                        <button onClick={() => scrollToSection('how-it-works')}>{t.nav.howItWorks}</button>
                        <button onClick={() => scrollToSection('faq')}>{t.nav.faq}</button>
                    </div>
                    <nav className={styles.nav}>
                        {renderLanguageSwitcher(styles.navLangSwitch)}
                        <Link to="/login" className={styles.loginBtn}>{t.nav.login}</Link>
                        <Link to="/register" className={styles.registerBtn}>{t.nav.register}</Link>
                    </nav>
                    
                    {/* Mobile Menu */}
                    <div className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ''}`}>
                        {renderLanguageSwitcher(styles.mobileLangSwitch)}
                        <button onClick={() => { scrollToSection('how-it-works'); setMobileMenuOpen(false); }}>{t.nav.howItWorks}</button>
                        <button onClick={() => { scrollToSection('faq'); setMobileMenuOpen(false); }}>{t.nav.faq}</button>
                        <Link to="/login" onClick={() => setMobileMenuOpen(false)}>{t.nav.login}</Link>
                        <Link to="/register" onClick={() => setMobileMenuOpen(false)}>{t.nav.register}</Link>
                    </div>
                </div>

                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>
                        {t.heroTitleMain}
                        <span className={styles.gradient}> {t.heroTitleAccent} <span className={styles.clickWord}>{t.heroTitleClick}</span></span>
                    </h1>
                    <p className={styles.heroDescription}>
                        {t.heroDescription}
                    </p>
                    
                    <div className={styles.ctaButtons}>
                        <button 
                            className={styles.primaryBtn}
                            onClick={() => setShowTrialModal(true)}
                        >
                            <span>{t.ctaPrimary}</span>
                            <span className={styles.arrow}>→</span>
                        </button>
                    </div>
                </div>

                <button 
                    className={styles.scrollBtn}
                    onClick={() => scrollToSection('how-it-works')}
                >
                    <span>{t.scrollDown}</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19M12 19L19 12M12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            {/* How It Works Section */}
            <section id="how-it-works" className={styles.section}>
                <div className={styles.sectionContent}>
                    <h2 className={styles.sectionTitle}>{t.howItWorksTitle}</h2>
                    <p className={styles.sectionSubtitle}>{t.howItWorksSubtitle}</p>

                    <div className={styles.steps}>
                        {howItWorksSteps.map((step, index) => (
                            <div 
                                key={index} 
                                className={styles.step}
                                style={{ animationDelay: `${index * 0.1}s` }}
                            >
                                <div className={styles.stepNumber}>{index + 1}</div>
                                <div className={styles.stepIcon}>{step.icon}</div>
                                <h3 className={styles.stepTitle}>{step.title}</h3>
                                <p className={styles.stepDescription}>{step.description}</p>
                            </div>
                        ))}
                    </div>

                    <div className={styles.techStack}>
                        <p className={styles.techLabel}>{t.techLabel}</p>
                        <div className={styles.techBadges}>
                            <span className={styles.badge}>React Flow</span>
                            <span className={styles.badge}>gRPC Streaming</span>
                            <span className={styles.badge}>AST Parser</span>
                            <span className={styles.badge}>FastAPI</span>
                            <span className={styles.badge}>PostgreSQL</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className={styles.section}>
                <div className={styles.sectionContent}>
                    <h2 className={styles.sectionTitle}>{t.faqTitle}</h2>
                    <p className={styles.sectionSubtitle}>{t.faqSubtitle}</p>

                    <div className={styles.faqList}>
                        {faqs.map((faq, index) => (
                            <div 
                                key={index} 
                                className={`${styles.faqItem} ${activeFaq === index ? styles.active : ''}`}
                                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                            >
                                <div className={styles.faqQuestion}>
                                    <h3>{faq.question}</h3>
                                    <svg 
                                        className={styles.faqIcon}
                                        width="24" 
                                        height="24" 
                                        viewBox="0 0 24 24" 
                                        fill="none"
                                    >
                                        <path 
                                            d="M19 9L12 16L5 9" 
                                            stroke="currentColor" 
                                            strokeWidth="2" 
                                            strokeLinecap="round" 
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                                <div className={styles.faqAnswer}>
                                    <p>{faq.answer}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className={styles.ctaSection}>
                <div className={styles.ctaContent}>
                    <h2>{t.ctaTitle}</h2>
                    <p>{t.ctaSubtitle}</p>
                    <Link to="/register" className={styles.ctaButton}>
                        {t.ctaButton}
                        <span className={styles.arrow}>→</span>
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <div className={styles.footerLogo}>
                        <img src={logoImage} alt="PIAPAV" />
                        <span>PIAPAV</span>
                    </div>
                    <p className={styles.copyright}>
                        © 2025 PIAPAV. {t.footerText}
                    </p>
                </div>
            </footer>

            {/* Trial Modal */}
            {showTrialModal && (
                <div className={styles.modalOverlay} onClick={() => setShowTrialModal(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <button 
                            className={styles.modalClose}
                            onClick={() => setShowTrialModal(false)}
                        >
                            ×
                        </button>
                        
                        <div className={styles.modalHeader}>
                            <h2>{t.modalTitle}</h2>
                            <div className={styles.warningBanner}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>{t.modalWarning}</span>
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button 
                                className={styles.modalPrimaryBtn}
                                onClick={() => {
                                    setShowTrialModal(false);
                                    navigate('/projects/new');
                                }}
                            >
                                {t.modalCreateProject}
                            </button>
                            <button 
                                className={styles.modalSecondaryBtn}
                                onClick={() => {
                                    setShowTrialModal(false);
                                    navigate('/register');
                                }}
                            >
                                {t.modalRegister}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
