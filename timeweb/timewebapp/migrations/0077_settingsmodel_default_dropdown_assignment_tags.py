# Generated by Django 3.2.7 on 2021-09-30 23:04

from django.db import migrations, models
import timewebapp.models


class Migration(migrations.Migration):

    dependencies = [
        ('timewebapp', '0076_alter_timewebmodel_funct_round'),
    ]

    operations = [
        migrations.AddField(
            model_name='settingsmodel',
            name='default_dropdown_assignment_tags',
            field=models.JSONField(blank=True, default=timewebapp.models.empty_list, verbose_name='Defaultd Dropdown Assignment Tags'),
        ),
    ]