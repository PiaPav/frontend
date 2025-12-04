import { useState } from 'react';
import styles from './Landing.module.css';
import { Link, useNavigate } from 'react-router-dom';
import logoImage from '../../assets/img/logo/deep-learning.png';

export default function Landing() {
    const [activeFaq, setActiveFaq] = useState(null);
    const [showTrialModal, setShowTrialModal] = useState(false);
    const navigate = useNavigate();

    const howItWorksSteps = [
        {
            icon: '📤',
            title: 'Загрузите проект',
            description: 'Просто загрузите архив с вашим кодом'
        },
        {
            icon: '🔍',
            title: 'Анализ кода в реальном времени',
            description: 'Система парсит зависимости, эндпоинты и строит граф вызовов в реальном времени'
        },
        {
            icon: '⚡',
            title: 'Анализируйте',
            description: 'Находите узкие места, понимайте связи и принимайте решения на основе данных'
        }
    ];

    const faqs = [
        {
            question: 'Какие языки программирования поддерживаются?',
            answer: 'В текущей версии мы поддерживаем Python проекты (FastAPI, Django, Flask). В ближайших обновлениях добавим JavaScript/TypeScript, Go и другие популярные языки.'
        },
        {
            question: 'Как PIAPAV анализирует мой код?',
            answer: 'Мы используем статический анализ AST (Abstract Syntax Tree) для построения графа зависимостей. Ваш код не выполняется, анализируется только структура.'
        },
        {
            question: 'Безопасно ли загружать код?',
            answer: 'Абсолютно! Весь код хранится в зашифрованном виде в S3-совместимом хранилище. Анализ происходит в изолированной среде. Мы не имеем доступа к вашему коду.'
        },
        {
            question: 'Можно ли экспортировать результаты?',
            answer: 'Да! Вы можете сохранить архитектуру проекта в базе данных и вернуться к ней в любое время. Функции экспорта в PNG/SVG будут добавлены в следующем обновлении.'
        },
        {
            question: 'Есть ли ограничения по размеру проекта?',
            answer: 'Для бесплатного аккаунта ограничение составляет 50 МБ на проект. Premium пользователи могут загружать проекты до 500 МБ.'
        },
        {
            question: 'Как работает real-time анализ?',
            answer: 'Мы используем gRPC streaming для передачи данных по мере их обработки. Вы видите прогресс анализа в реальном времени: зависимости → эндпоинты → граф вызовов.'
        }
    ];

    const scrollToSection = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className={styles.container}>
            {/* Hero Section */}
            <div className={styles.heroSection}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <img src={logoImage} alt="PIAPAV logo" />
                        <span>PIAPAV</span>
                    </div>
                    <div className={styles.centerNav}>
                        <button onClick={() => scrollToSection('how-it-works')}>Как это работает</button>
                        <button onClick={() => scrollToSection('faq')}>FAQ</button>
                    </div>
                    <nav className={styles.nav}>
                        <Link to="/login" className={styles.loginBtn}>Вход</Link>
                        <Link to="/register" className={styles.registerBtn}>Регистрация</Link>
                    </nav>
                </div>

                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>
                        Визуализируйте архитектуру
                        <span className={styles.gradient}> в один <span className={styles.clickWord}>клик</span></span>
                    </h1>
                    <p className={styles.heroDescription}>
                        Интерактивные диаграммы из вашего кода. PIAPAV анализирует модули, 
                        выявляет зависимости между слоями и помогает выявить риски мгновенно.
                    </p>
                    
                    <div className={styles.ctaButtons}>
                        <button 
                            className={styles.primaryBtn}
                            onClick={() => setShowTrialModal(true)}
                        >
                            <span>Попробовать бесплатно</span>
                            <span className={styles.arrow}>→</span>
                        </button>
                    </div>
                </div>

                <button 
                    className={styles.scrollBtn}
                    onClick={() => scrollToSection('how-it-works')}
                >
                    <span>Прокрутить вниз</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19M12 19L19 12M12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            {/* How It Works Section */}
            <section id="how-it-works" className={styles.section}>
                <div className={styles.sectionContent}>
                    <h2 className={styles.sectionTitle}>Как это работает</h2>
                    <p className={styles.sectionSubtitle}>
                        Четыре простых шага до полного понимания вашей архитектуры
                    </p>

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
                        <p className={styles.techLabel}>Технологии:</p>
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
                    <h2 className={styles.sectionTitle}>Часто задаваемые вопросы</h2>
                    <p className={styles.sectionSubtitle}>
                        Всё, что вам нужно знать о PIAPAV
                    </p>

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
                    <h2>Готовы увидеть свою архитектуру?</h2>
                    <p>Начните анализировать проекты бесплатно уже сегодня</p>
                    <Link to="/register" className={styles.ctaButton}>
                        Начать сейчас
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
                        © 2025 PIAPAV. Визуализация архитектуры проектов.
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
                            <h2>Пробная версия</h2>
                            <div className={styles.warningBanner}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>Без регистрации можно создать только один проект</span>
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
                                Создать проект
                            </button>
                            <button 
                                className={styles.modalSecondaryBtn}
                                onClick={() => {
                                    setShowTrialModal(false);
                                    navigate('/register');
                                }}
                            >
                                Зарегистрироваться
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}