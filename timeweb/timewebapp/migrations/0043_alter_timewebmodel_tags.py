# Generated by Django 3.2.4 on 2021-06-23 18:49

from django.db import migrations, models
import timewebapp.models


class Migration(migrations.Migration):

    dependencies = [
        ('timewebapp', '0042_timewebmodel_tags'),
    ]

    operations = [
        migrations.AlterField(
            model_name='timewebmodel',
            name='tags',
            field=models.JSONField(blank=True, default=timewebapp.models.default_tags, null=True),
        ),
    ]