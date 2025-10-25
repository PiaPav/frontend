import styles from './Landing.module.css'


export default function Landing() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.logo}><img src=".\src\assets\img\logo\deep-learning.png" alt="logo" /></div>
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
                <button><a href="#guest">TRY FOR FREE</a></button>
                <p>Already have account? <a href="#login">Login</a></p>
            </div>

        </div>

    );
}