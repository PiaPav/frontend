import styles from './Landing.module.css';
import { Link } from 'react-router-dom';
import logoImage from '../../assets/img/logo/deep-learning.png';
import arrowDownImage from '../../assets/img/arrow_down.svg';

export default function Landing() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.logo}><img src={logoImage} alt="logo" /></div>
                <div className={styles.infoSection}>
                    <p>How it works</p>
                    <p>FAQ</p>
                </div>
            </div>
            <div className={styles.NameDescription}>
                <h1>PIAPAV</h1>
                <p>Your system map in one click.  Interactive diagrams from your codebase and project artifacts, reveals module relationships, layers, and dependencies, and helps you spot risks fast.</p>
            </div>
            <div className={styles.tryButton}>
                <button><a className={styles.primaryCta} href="#guest">TRY FOR FREE</a></button>
                <p>Already have account? <Link to="/login">Login</Link></p>
            </div>
            <div className={styles.ScrollButton}>
                <button>         
                    <a href="#scrolldown">
                        <p>Scroll down</p>
                        <img src={arrowDownImage} alt="arrow down" />
                    </a>
                </button>
            </div>
        </div>

    );
}