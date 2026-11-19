package sk.lgremote.pages;

import android.app.Activity;
import android.view.View;

/** Jedna stranka ovladaca. Appka ich listuje prstom zlava doprava. */
public interface RemotePage {

    /** Nazov v zahlavi. */
    String title();

    /** Kratky popis zariadenia pod nazvom. */
    String subtitle();

    /** Vytvori obsah stranky. */
    View create(Activity activity);

    /** Zavola sa, ked sa appka zatvara. */
    default void release() {
    }
}
