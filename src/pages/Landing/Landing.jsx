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
            <section className=""></section>
        </div>
    );
}